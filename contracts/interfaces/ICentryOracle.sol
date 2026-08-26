// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICentryOracle {
    function getPrice(
        address asset
    ) external view returns (
        uint256 priceE18,
        uint256 updatedAt
    );
}
