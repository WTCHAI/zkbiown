// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IZTIZENAdmin
 * @dev Admin interface for ZTIZEN
 */
interface IZTIZENAdmin {
    function addWhitelistedUser(address userAddress) external;
    function removeWhitelistedUser(address userAddress) external;
    function isUserWhitelisted(address userAddress) external view returns (bool whitelisted);
    function setZKVerifier(address verifierAddress) external;
    function setZKVerificationEnabled(bool enabled) external;
    function getStats() external view returns (uint256 totalCredentials_, bool zkEnabled, address verifierAddress);
}
