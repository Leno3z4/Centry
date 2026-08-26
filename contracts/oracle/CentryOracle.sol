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
/// @notice Chainlink-style USD oracle adapter with explicit staleness bounds.
/// @dev Returned prices are normalized to 1e18.
contract CentryOracle is Ownable2Step, Pausable {
    struct FeedConfig {
        address feed;
        uint32 maxStaleness;
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
        if (
            asset == address(0) ||
            feed == address(0)
        ) {
            revert InvalidFeed();
        }

        if (
            maxStaleness == 0 ||
            maxStaleness > 30 days
        ) {
            revert InvalidStaleness();
        }

        IAggregatorV3(feed).decimals();

        feeds[asset] = FeedConfig({
            feed: feed,
            maxStaleness: maxStaleness,
            enabled: enabled
        });

        emit FeedConfigured(
            asset,
            feed,
            maxStaleness,
            enabled
        );
    }

    function disableFeed(
        address asset
    ) external onlyOwner {
        feeds[asset].enabled = false;
        emit FeedDisabled(asset);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getPrice(
        address asset
    ) external view returns (
        uint256 priceE18,
        uint256 updatedAt
    ) {
        FeedConfig memory config = feeds[asset];

        if (
            !config.enabled ||
            config.feed == address(0)
        ) {
            revert AssetNotConfigured();
        }

        (
            ,
            int256 answer,
            ,
            uint256 timestamp,
            uint80 answeredInRound
        ) = IAggregatorV3(config.feed).latestRoundData();

        if (
            answer <= 0 ||
            timestamp == 0 ||
            answeredInRound == 0
        ) {
            revert InvalidPrice();
        }

        if (
            timestamp > block.timestamp ||
            block.timestamp - timestamp > config.maxStaleness
        ) {
            revert StalePrice();
        }

        uint8 feedDecimals = IAggregatorV3(config.feed).decimals();

        if (feedDecimals > 18) {
            priceE18 = uint256(answer) /
                (10 ** (feedDecimals - 18));
        } else {
            priceE18 = uint256(answer) *
                (10 ** (18 - feedDecimals));
        }

        if (priceE18 == 0) {
            revert InvalidPrice();
        }

        updatedAt = timestamp;
    }
}
