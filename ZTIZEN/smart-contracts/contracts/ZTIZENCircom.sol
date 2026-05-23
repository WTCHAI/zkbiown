// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IZTIZENCore.sol";
import "./interfaces/IZTIZENAdmin.sol";

/// @dev Groth16 verifier interface — implemented by CircomVerifier.sol (Groth16Verifier)
/// pubSignals layout (129 values):
///   [0]       = match_count  (how many of 128 Poseidon slots matched — must be ≥102)
///   [1..128]  = computed_commit[0..127]  (Poseidon(bits, nonce_N, keys) for each slot)
interface ICircomVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[129] calldata pubSignals
    ) external view returns (bool);
}

/**
 * @title ZTIZENCircom
 * @dev Trustless Biometric Authentication — Circom/Groth16 backend only
 *
 * Enrollment (one-time, off-chain → on-chain):
 *   face → BioHash → Poseidon(bits, nonce_0, keys) × 128 → commit[128]
 *   Oracle calls registerCredential() + initializeCredentialForService(nonce_0)
 *   nonce_0 stored on-chain via credentialServiceNonces[credentialId][serviceId]
 *
 * Verification (each login):
 *   face → BioHash → Poseidon(bits, nonce_N, keys) × 128 → proof input
 *   ZK circuit proves: Poseidon(bits, nonce_N, keys) == commit[i] for ≥102/128 slots
 *   User submits proof to verifyProof()
 *   Contract checks: currentNonce == storedNonce (replay guard)
 *   Contract calls Groth16Verifier.verifyProof(pA, pB, pC, pubSignals) directly
 *   On success: nonce_N → nonce_{N+1} via keccak roll (unpredictable until mined)
 *
 * Proof params passed directly (no ABI-encoding wrapper):
 *   pA, pB, pC    — Groth16 proof points
 *   pubSignals    — uint256[129]: [0]=match_count, [1..128]=computed_commit[0..127]
 */
contract ZTIZENCircom is Ownable, ReentrancyGuard, IZTIZENCore, IZTIZENAdmin {

    // ============ Storage ============

    /// @dev (credentialId, serviceId) → current nonce_N
    /// Zero means not yet initialized for this service.
    /// Rolls to keccak-derived nonce_{N+1} after each successful verification.
    mapping(bytes32 => mapping(bytes32 => uint256)) public credentialServiceNonces;

    mapping(bytes32 => IZTIZENCore.CredentialMeta) private _credentials;
    mapping(address => bytes32[]) private _ownerCredentials;
    mapping(address => bool) public whitelistedUsers;

    uint256 public totalCredentials;
    bool public zkVerificationEnabled;

    ICircomVerifier public circomVerifier;

    // ============ Events ============

    event CredentialRegistered(bytes32 indexed credentialId, address indexed owner, uint256 version, uint256 timestamp);
    event CredentialActivatedForService(bytes32 indexed credentialId, bytes32 indexed serviceId, uint256 initialNonce, uint256 timestamp);
    event CredentialDeactivated(bytes32 indexed credentialId, address indexed owner, uint256 timestamp);
    event CredentialReactivated(bytes32 indexed credentialId, address indexed owner, uint256 timestamp);

    /// @dev Emitted on every successful proof verification.
    /// Off-chain service MUST listen to this event to learn newNonce and
    /// recompute commit[128] = Poseidon(bits, newNonce, keys) before next login.
    event ProofVerified(
        bytes32 indexed credentialId,
        bytes32 indexed serviceId,
        bytes32 indexed productTxId,
        address caller,
        uint256 oldNonce,
        uint256 newNonce,
        uint256 timestamp
    );

    event NonceRevoked(bytes32 indexed credentialId, bytes32 indexed serviceId, uint256 oldNonce, uint256 newNonce, uint256 timestamp);
    event UserWhitelisted(address indexed userAddress);
    event UserRemovedFromWhitelist(address indexed userAddress);
    event ZKVerificationEnabledChanged(bool enabled);
    event VerifierChanged(address newVerifier);

    // ============ Modifiers ============

    modifier onlyCredentialOwner(bytes32 _credentialId) {
        require(_credentials[_credentialId].owner == msg.sender, "ZTIZEN: Not credential owner");
        _;
    }

    modifier credentialMustExist(bytes32 _credentialId) {
        require(_credentials[_credentialId].owner != address(0), "ZTIZEN: Credential does not exist");
        _;
    }

    modifier credentialMustBeActive(bytes32 _credentialId) {
        require(_credentials[_credentialId].isActive, "ZTIZEN: Credential is not active");
        _;
    }

    modifier onlyWhitelisted(address _user) {
        require(whitelistedUsers[_user], "ZTIZEN: User not whitelisted");
        _;
    }

    // ============ Constructor ============

    constructor(address _circomVerifier) Ownable(msg.sender) {
        require(_circomVerifier != address(0), "ZTIZENCircom: Verifier address required");
        circomVerifier = ICircomVerifier(_circomVerifier);
        zkVerificationEnabled = false;
    }

    // ============ Enrollment — Credential Registration ============

    /**
     * @dev Step 1 of enrollment: register a credential for a whitelisted user.
     * Called by oracle after off-chain BioHash + commit[128] computation.
     * Only registers identity — nonce is set separately via initializeCredentialForService.
     */
    function registerCredential(
        bytes32 credentialId,
        address userAddress,
        uint256 version
    ) external override onlyOwner onlyWhitelisted(userAddress) nonReentrant returns (bool) {
        require(_credentials[credentialId].owner == address(0), "ZTIZEN: Credential already exists");
        require(version > 0, "ZTIZEN: Invalid version");

        _credentials[credentialId] = IZTIZENCore.CredentialMeta({
            owner: userAddress,
            version: version,
            isActive: true,
            registeredAt: block.timestamp,
            lastVerifiedAt: 0
        });

        _ownerCredentials[userAddress].push(credentialId);
        totalCredentials++;

        emit CredentialRegistered(credentialId, userAddress, version, block.timestamp);
        return true;
    }

    /**
     * @dev Step 2 of enrollment: anchor nonce_0 on-chain for a (credential, service) pair.
     * The off-chain service has already computed commit[128] = Poseidon(bits, nonce_0, keys)
     * and stored it in the ZTIZEN service DB keyed by (credentialId, serviceId, nonce_0).
     * This call records nonce_0 on-chain so verifyProof can validate it on first login.
     */
    function initializeCredentialForService(
        bytes32 credentialId,
        bytes32 serviceId,
        uint256 initialNonce
    ) external override onlyOwner credentialMustExist(credentialId) credentialMustBeActive(credentialId) nonReentrant returns (bool) {
        require(credentialServiceNonces[credentialId][serviceId] == 0, "ZTIZEN: Already initialized");
        require(initialNonce > 0, "ZTIZEN: Initial nonce must be non-zero");

        credentialServiceNonces[credentialId][serviceId] = initialNonce;
        emit CredentialActivatedForService(credentialId, serviceId, initialNonce, block.timestamp);
        return true;
    }

    // ============ Verification — ZK Proof + Nonce Roll ============

    /**
     * @dev Verify a Circom/Groth16 biometric proof and roll nonce_N → nonce_{N+1}.
     *
     * Flow:
     *   1. Check currentNonce == storedNonce (replay guard)
     *   2. Decode proof bytes as (pA, pB, pC) and decode publicInputs as pubSignals[129]
     *   3. Forward to Groth16Verifier.verifyProof() — reverts if invalid
     *   4. Roll nonce: newNonce = keccak(nonce_N, block.timestamp, block.number, block.prevrandao)
     *      — unpredictable to prover at proof-generation time (prevrandao not known until mined)
     *   5. Store newNonce on-chain
     *   6. Emit ProofVerified(oldNonce, newNonce) — off-chain service reads newNonce here
     *      and recomputes commit[128] = Poseidon(bits, newNonce, keys) for next login
     *
     * @param credentialId  Credential being verified
     * @param serviceId     Service requesting auth (scopes the nonce)
     * @param currentNonce  nonce_N — must match on-chain stored nonce
     * @param productTxId   Audit trail ID from the calling service
     * @param pA            Groth16 proof point A
     * @param pB            Groth16 proof point B
     * @param pC            Groth16 proof point C
     * @param pubSignals    uint256[129]: [0]=match_count, [1..128]=computed_commit[0..127]
     */
    function verifyProof(
        bytes32 credentialId,
        bytes32 serviceId,
        uint256 currentNonce,
        bytes32 productTxId,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[129] calldata pubSignals
    )
        external
        nonReentrant
        credentialMustExist(credentialId)
        credentialMustBeActive(credentialId)
        returns (bool success, uint256 newNonce)
    {
        require(zkVerificationEnabled, "ZTIZEN: ZK verification not enabled");

        // Replay guard
        uint256 storedNonce = credentialServiceNonces[credentialId][serviceId];
        require(storedNonce != 0, "ZTIZEN: Credential not initialized for service");
        require(currentNonce == storedNonce, "ZTIZEN: Invalid nonce, use current on-chain nonce");

        // Forward directly to Groth16Verifier — same param types, no decoding needed
        bool valid = circomVerifier.verifyProof(pA, pB, pC, pubSignals);
        require(valid, "ZTIZENCircom: Invalid Circom proof");

        // Roll nonce: keccak(nonce_N || block context) — prevrandao ensures unpredictability
        newNonce = _rollNonce(currentNonce);
        credentialServiceNonces[credentialId][serviceId] = newNonce;
        _credentials[credentialId].lastVerifiedAt = block.timestamp;

        // Off-chain service listens here to learn newNonce and re-bake commit[128]
        emit ProofVerified(credentialId, serviceId, productTxId, msg.sender, currentNonce, newNonce, block.timestamp);
        return (true, newNonce);
    }

    // ============ Nonce Queries & Revocation ============

    function getNonce(bytes32 credentialId, bytes32 serviceId) external view returns (uint256) {
        return credentialServiceNonces[credentialId][serviceId];
    }

    function isCredentialInitializedForService(bytes32 credentialId, bytes32 serviceId) external view returns (bool) {
        return credentialServiceNonces[credentialId][serviceId] != 0;
    }

    /**
     * @dev Emergency nonce revocation by credential owner.
     * Rolls nonce without a proof — invalidates current off-chain commit[].
     * User must re-enroll (oracle re-runs BioHash + sets new commit[]) after this.
     * Use when session is suspected compromised.
     */
    function revokeNonce(bytes32 credentialId, bytes32 serviceId)
        external
        nonReentrant
        onlyCredentialOwner(credentialId)
        credentialMustExist(credentialId)
        returns (uint256 newNonce)
    {
        uint256 oldNonce = credentialServiceNonces[credentialId][serviceId];
        require(oldNonce != 0, "ZTIZEN: Credential not initialized for service");

        newNonce = _rollNonce(oldNonce);
        credentialServiceNonces[credentialId][serviceId] = newNonce;

        emit NonceRevoked(credentialId, serviceId, oldNonce, newNonce, block.timestamp);
        return newNonce;
    }

    // ============ Credential Management ============

    function deactivateCredential(bytes32 credentialId)
        external override nonReentrant onlyCredentialOwner(credentialId) credentialMustExist(credentialId)
        returns (bool)
    {
        require(_credentials[credentialId].isActive, "ZTIZEN: Already deactivated");
        _credentials[credentialId].isActive = false;
        emit CredentialDeactivated(credentialId, msg.sender, block.timestamp);
        return true;
    }

    function reactivateCredential(bytes32 credentialId)
        external override nonReentrant onlyCredentialOwner(credentialId) credentialMustExist(credentialId)
        returns (bool)
    {
        require(!_credentials[credentialId].isActive, "ZTIZEN: Already active");
        _credentials[credentialId].isActive = true;
        emit CredentialReactivated(credentialId, msg.sender, block.timestamp);
        return true;
    }

    // ============ Credential Queries ============

    function credentialExists(bytes32 credentialId) external view override returns (bool) {
        return _credentials[credentialId].owner != address(0);
    }

    function isCredentialActive(bytes32 credentialId) external view override returns (bool) {
        return _credentials[credentialId].isActive;
    }

    function getCredentialOwner(bytes32 credentialId) external view override returns (address) {
        return _credentials[credentialId].owner;
    }

    function getCredential(bytes32 credentialId)
        external view override credentialMustExist(credentialId)
        returns (IZTIZENCore.CredentialMeta memory)
    {
        return _credentials[credentialId];
    }

    function getOwnerCredentials(address owner) external view override returns (bytes32[] memory) {
        return _ownerCredentials[owner];
    }

    // ============ Whitelist ============

    function addWhitelistedUser(address userAddress) external override onlyOwner {
        require(userAddress != address(0), "ZTIZEN: Invalid address");
        whitelistedUsers[userAddress] = true;
        emit UserWhitelisted(userAddress);
    }

    function removeWhitelistedUser(address userAddress) external override onlyOwner {
        whitelistedUsers[userAddress] = false;
        emit UserRemovedFromWhitelist(userAddress);
    }

    function isUserWhitelisted(address userAddress) external view override returns (bool) {
        return whitelistedUsers[userAddress];
    }

    // ============ Admin ============

    function setZKVerifier(address verifierAddress) external override onlyOwner {
        require(verifierAddress != address(0), "ZTIZEN: Invalid address");
        circomVerifier = ICircomVerifier(verifierAddress);
        emit VerifierChanged(verifierAddress);
    }

    function setZKVerificationEnabled(bool enabled) external override onlyOwner {
        zkVerificationEnabled = enabled;
        emit ZKVerificationEnabledChanged(enabled);
    }

    function getStats()
        external view override
        returns (uint256 totalCredentials_, bool zkEnabled, address verifierAddress)
    {
        return (totalCredentials, zkVerificationEnabled, address(circomVerifier));
    }

    // ============ Internal ============

    /**
     * @dev Roll nonce: keccak(currentNonce || block.timestamp || block.number || block.prevrandao)
     * block.prevrandao (EIP-4399) is set by the beacon chain randomness beacon —
     * unknown to the prover when generating the proof, so they cannot pre-compute newNonce.
     */
    function _rollNonce(uint256 currentNonce) internal view returns (uint256 newNonce) {
        newNonce = uint256(
            keccak256(abi.encodePacked(currentNonce, block.timestamp, block.number, block.prevrandao))
        );
        if (newNonce == 0) newNonce = 1;
    }
}
