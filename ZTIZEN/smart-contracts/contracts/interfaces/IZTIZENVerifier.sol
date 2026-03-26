// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IZTIZENVerifier
 * @dev Trustless ZK proof verification for biometric authentication
 *
 * IMPORTANT: ONLY ZK proof verification. No fallback mechanisms.
 * This is a trustless system - verification is either valid ZK proof or nothing.
 */
interface IZTIZENVerifier {
    // ============ ZK Proof Verification (ONLY METHOD) ============

    /**
     * @dev Verify ZK proof - THE ONLY VERIFICATION METHOD
     *
     * Trustless verification: proof must be cryptographically valid.
     * No traditional fallback, no alternative verification methods.
     *
     * @param credentialId Unique credential identifier
     * @param serviceId Service identifier requesting verification
     * @param currentNonce Current nonce used in proof generation
     * @param productTxId Transaction ID from product service (audit trail)
     * @param proof ZK proof bytes (Noir circuit generated)
     * @param publicInputs Public inputs for the proof
     *
     * @return success Always true (reverts on failure)
     * @return newNonce New nonce after successful verification
     */
    function verifyProof(
        bytes32 credentialId,
        bytes32 serviceId,
        uint256 currentNonce,
        bytes32 productTxId,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external returns (bool success, uint256 newNonce);

    // ============ Nonce Management ============

    /**
     * @dev Get current nonce for credential + service pair
     *
     * @param credentialId Credential identifier
     * @param serviceId Service identifier
     * @return nonce Current nonce (0 if not initialized)
     */
    function getNonce(bytes32 credentialId, bytes32 serviceId) external view returns (uint256 nonce);

    /**
     * @dev Check if credential is initialized for a service
     *
     * @param credentialId Credential identifier
     * @param serviceId Service identifier
     * @return initialized True if credential is initialized for this service
     */
    function isCredentialInitializedForService(
        bytes32 credentialId,
        bytes32 serviceId
    ) external view returns (bool initialized);

    /**
     * @dev Manually revoke current nonce (credential owner only)
     *
     * Allows credential owner to invalidate current nonce if compromised.
     *
     * @param credentialId Credential identifier
     * @param serviceId Service identifier
     * @return newNonce New nonce after revocation
     */
    function revokeNonce(bytes32 credentialId, bytes32 serviceId) external returns (uint256 newNonce);
}
