// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICentryYieldStrategy {
    function asset() external view returns (address);

    function vault() external view returns (address);

    function totalManagedAssets() external view returns (uint256);

    function harvest() external returns (uint256 yieldAmount);
}
