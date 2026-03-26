// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IZTIZENCore
 * @dev Core credential operations for trustless biometric authentication
 *
 * Registration flow:
 * 1. Owner adds user to whitelist (oracle-verified)
 * 2. Owner registers credential for user
 * 3. Owner initializes credential for specific service with nonce
 */
interface IZTIZENCore {
    /**
     * @dev Credential metadata structure
     */
    struct CredentialMeta {
        address owner;           // User wallet (oracle-verified)
        uint256 version;         // Protocol version
        bool isActive;           // Active/inactive status
        uint256 registeredAt;    // Registration timestamp
        uint256 lastVerifiedAt;  // Last successful verification
    }

    // ============ Credential Registration ============

    /**
     * @dev Register a new biometric credential for a whitelisted user
     *
     * Only owner (oracle) can register. User must be whitelisted first.
     *
     * @param credentialId Unique credential identifier
     * @param userAddress Whitelisted user address
     * @param version Protocol version
     * @return success Registration status
     */
    function registerCredential(
        bytes32 credentialId,
        address userAddress,
        uint256 version
    ) external returns (bool success);

    /**
     * @dev Initialize credential for use with a specific service
     *
     * Sets up the first nonce for credential + service pair.
     * Only owner can initialize.
     *
     * @param credentialId Credential identifier
     * @param serviceId Service identifier
     * @param initialNonce Initial nonce for this credential+service pair
     * @return success Initialization status
     */
    function initializeCredentialForService(
        bytes32 credentialId,
        bytes32 serviceId,
        uint256 initialNonce
    ) external returns (bool success);

    // ============ Credential Management ============

    /**
     * @dev Deactivate a credential (soft delete)
     *
     * Only credential owner can deactivate.
     * Makes credential unusable for all services.
     *
     * @param credentialId Credential identifier
     * @return success Deactivation status
     */
    function deactivateCredential(bytes32 credentialId) external returns (bool success);

    /**
     * @dev Reactivate a deactivated credential
     *
     * Only credential owner can reactivate.
     *
     * @param credentialId Credential identifier
     * @return success Reactivation status
     */
    function reactivateCredential(bytes32 credentialId) external returns (bool success);

    // ============ Credential Queries ============

    /**
     * @dev Check if credential exists
     * @param credentialId Credential identifier
     * @return exists True if credential exists
     */
    function credentialExists(bytes32 credentialId) external view returns (bool exists);

    /**
     * @dev Check if credential is active
     * @param credentialId Credential identifier
     * @return active True if credential is active
     */
    function isCredentialActive(bytes32 credentialId) external view returns (bool active);

    /**
     * @dev Get credential owner address
     * @param credentialId Credential identifier
     * @return owner Owner address
     */
    function getCredentialOwner(bytes32 credentialId) external view returns (address owner);

    /**
     * @dev Get full credential metadata
     *
     * @param credentialId Credential identifier
     * @return metadata Credential metadata
     */
    function getCredential(bytes32 credentialId) external view returns (CredentialMeta memory metadata);

    /**
     * @dev Get all credentials for an owner
     *
     * @param owner Owner address
     * @return credentialIds Array of credential IDs owned by this address
     */
    function getOwnerCredentials(address owner) external view returns (bytes32[] memory credentialIds);

}
