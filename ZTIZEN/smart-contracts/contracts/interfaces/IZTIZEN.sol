// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IZTIZENCore.sol";
import "./IZTIZENVerifier.sol";
import "./IZTIZENAdmin.sol";

/**
 * @title IZTIZEN
 * @dev Comprehensive interface for trustless biometric authentication system
 *
 * Combines core credential operations with trustless ZK proof verification
 * and admin configuration.
 *
 * Single responsibility: biometric credential lifecycle + ZK verification + admin ops.
 *
 * Registration (oracle-only):
 * 1. Owner whitelists users
 * 2. Owner registers credentials for whitelisted users
 * 3. Owner initializes credentials for specific services with nonces
 *
 * Verification (permissionless):
 * - Anyone can submit ZK proofs for credentials they have access to
 * - Trustless: proof must be cryptographically valid (no fallback)
 * - Automatic nonce rolling prevents replay attacks
 *
 * Administration (oracle-only):
 * - Configure ZK Verifier contract address
 * - Enable/disable ZK verification
 * - Query system statistics
 *
 * This is the SINGLE interface for ZTIZEN smart contract.
 */
interface IZTIZEN is IZTIZENCore, IZTIZENVerifier, IZTIZENAdmin {
    // All functionality inherited from IZTIZENCore, IZTIZENVerifier, and IZTIZENAdmin
    // - Core: credential registration, management, whitelist
    // - Verifier: trustless ZK proof verification only
    // - Admin: verifier configuration and statistics
}
