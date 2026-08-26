// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";

import "../interfaces/ICentryOracle.sol";

/// @title Centry Mock Oracle
/// @notice Test-only oracle. Never use with real funds.
contract CentryMockOracle is ICentryOracle, Ownable2Step {
    mapping(address => uint256) public prices;
    mapping(address => uint256) public updatedAt;

    error InvalidAddress();
    error InvalidPrice();
    error PriceNotSet();

    constructor(address owner_) Ownable(owner_) {
        if (owner_ == address(0)) {
            revert InvalidAddress();
        }
    }

    function setPrice(
        address asset,
        uint256 priceE18
    ) external onlyOwner {
        if (asset == address(0)) {
            revert InvalidAddress();
        }

        if (priceE18 == 0) {
            revert InvalidPrice();
        }

        prices[asset] = priceE18;
        updatedAt[asset] = block.timestamp;
    }

    function getPrice(
        address asset
    ) external view returns (
        uint256 priceE18,
        uint256 timestamp
    ) {
        priceE18 = prices[asset];
        timestamp = updatedAt[asset];

        if (priceE18 == 0) {
            revert PriceNotSet();
        }
    }
}
