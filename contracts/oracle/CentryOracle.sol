// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Chainlink-style USD oracle adapter with explicit staleness bounds.
/// @dev Price is normalized to 1e18. Only positive, complete rounds are accepted.
contract CentryOracle is Ownable2Step, Pausable {
    error AssetNotConfigured();
    error InvalidFeed();
    error InvalidPrice();
    error StalePrice();
    error InvalidStaleness();

    struct FeedConfig { address feed; uint32 maxStaleness; bool enabled; }
    mapping(address => FeedConfig) public feeds;

    event FeedConfigured(address indexed asset, address indexed feed, uint32 maxStaleness, bool enabled);
    event FeedDisabled(address indexed asset);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setFeed(address asset, address feed, uint32 maxStaleness, bool enabled) external onlyOwner {
        if (asset == address(0) || feed == address(0)) revert InvalidFeed();
        if (maxStaleness == 0 || maxStaleness > 30 days) revert InvalidStaleness();
        IAggregatorV3(feed).decimals();
        feeds[asset] = FeedConfig(feed, maxStaleness, enabled);
        emit FeedConfigured(asset, feed, maxStaleness, enabled);
    }

    function disableFeed(address asset) external onlyOwner {
        feeds[asset].enabled = false;
        emit FeedDisabled(asset);
    }

    function getPrice(address asset) external view returns (uint256 priceE18, uint256 updatedAt) {
        FeedConfig memory cfg = feeds[asset];
        if (!cfg.enabled || cfg.feed == address(0)) revert AssetNotConfigured();
        (, int256 answer, , uint256 timestamp, uint80 answeredInRound) = IAggregatorV3(cfg.feed).latestRoundData();
        if (answer <= 0 || timestamp == 0 || answeredInRound == 0) revert InvalidPrice();
        if (block.timestamp > timestamp + cfg.maxStaleness) revert StalePrice();
        uint8 feedDecimals = IAggregatorV3(cfg.feed).decimals();
        if (feedDecimals > 18) priceE18 = uint256(answer) / (10 ** (feedDecimals - 18));
        else priceE18 = uint256(answer) * (10 ** (18 - feedDecimals));
        updatedAt = timestamp;
    }
}
