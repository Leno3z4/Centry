// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";

interface IAggregatorV3 {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title Centry Oracle
/// @notice Multi-asset Chainlink Data Feed adapter for Centry.
/// @dev Prices are normalized to 18 decimals and rejected when stale,
///      incomplete, negative, zero, or otherwise invalid.
contract CentryOracle is Ownable2Step, Pausable {
    enum FeedType {
        None,
        Aggregator
    }

    struct FeedConfig {
        address feed;
        uint8 feedDecimals;
        uint32 maxStaleness;
        FeedType feedType;
        bool enabled;
    }

    mapping(address => FeedConfig) public feeds;

    error AssetNotConfigured();
    error InvalidFeed();
    error InvalidPrice();
    error InvalidStaleness();
    error StalePrice();

    event FeedConfigured(
        address indexed asset,
        address indexed feed,
        FeedType feedType,
        uint8 feedDecimals,
        uint32 maxStaleness,
        bool enabled
    );

    event FeedDisabled(address indexed asset);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setFeed(
        address asset,
        address feed,
        uint32 maxStaleness,
        bool enabled
    ) external onlyOwner {
        if (asset == address(0) || feed == address(0)) {
            revert InvalidFeed();
        }

        if (maxStaleness == 0 || maxStaleness > 30 days) {
            revert InvalidStaleness();
        }

        uint8 feedDecimals = IAggregatorV3(feed).decimals();

        if (feedDecimals > 18) {
            revert InvalidFeed();
        }

        feeds[asset] = FeedConfig({
            feed: feed,
            feedDecimals: feedDecimals,
            maxStaleness: maxStaleness,
            feedType: FeedType.Aggregator,
            enabled: enabled
        });

        emit FeedConfigured(
            asset,
            feed,
            FeedType.Aggregator,
            feedDecimals,
            maxStaleness,
            enabled
        );
    }

    function disableFeed(address asset) external onlyOwner {
        feeds[asset].enabled = false;
        emit FeedDisabled(asset);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getPrice(address asset)
        external
        view
        whenNotPaused
        returns (uint256 priceE18, uint256 updatedAt)
    {
        FeedConfig memory config = feeds[asset];

        if (
            !config.enabled ||
            config.feed == address(0) ||
            config.feedType != FeedType.Aggregator
        ) {
            revert AssetNotConfigured();
        }

        return _getAggregatorPrice(config);
    }

    function _getAggregatorPrice(FeedConfig memory config)
        internal
        view
        returns (uint256 priceE18, uint256 updatedAt)
    {
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 timestamp,
            uint80 answeredInRound
        ) = IAggregatorV3(config.feed).latestRoundData();

        // Reject empty/invalid rounds and incomplete rounds.
        if (
            roundId == 0 ||
            answer <= 0 ||
            startedAt == 0 ||
            timestamp == 0 ||
            answeredInRound == 0 ||
            answeredInRound < roundId
        ) {
            revert InvalidPrice();
        }

        if (
            startedAt > block.timestamp ||
            timestamp > block.timestamp ||
            startedAt > timestamp
        ) {
            revert InvalidPrice();
        }

        if (block.timestamp - timestamp > config.maxStaleness) {
            revert StalePrice();
        }

        priceE18 = uint256(answer) * (10 ** (18 - config.feedDecimals));

        if (priceE18 == 0) {
            revert InvalidPrice();
        }

        updatedAt = timestamp;
    }
}
