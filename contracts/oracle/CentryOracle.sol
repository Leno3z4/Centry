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

/// @notice Generic Centry oracle adapter interface for non-Chainlink providers.
/// @dev Adapters MUST return a positive price normalized to 18 decimals and
///      the timestamp for the observation. CentryOracle enforces the common
///      validity and staleness checks around the adapter response.
interface ICentryOracleAdapter {
    function getPrice(address asset)
        external
        view
        returns (uint256 priceE18, uint256 updatedAt);
}

/// @title Centry Oracle
/// @notice Multi-asset oracle router with Chainlink AggregatorV3 as the native
///      provider and an adapter path for additional oracle providers.
/// @dev Existing Chainlink behavior is preserved through setFeed(). Alternate
///      providers can be added as adapters. An adapter can be marked primary,
///      or kept as a fallback behind Chainlink.
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

    struct AdapterConfig {
        address adapter;
        uint32 maxStaleness;
        bool enabled;
        bool primary;
    }

    // Kept unchanged so the existing Chainlink configuration ABI/storage
    // shape remains compatible with the previous contract implementation.
    mapping(address => FeedConfig) public feeds;

    // One alternate adapter may be configured per asset. The adapter itself
    // can wrap any supported oracle provider and return the common interface.
    mapping(address => AdapterConfig) public adapters;

    error AssetNotConfigured();
    error InvalidFeed();
    error InvalidAdapter();
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

    event AdapterConfigured(
        address indexed asset,
        address indexed adapter,
        uint32 maxStaleness,
        bool enabled,
        bool primary
    );

    event AdapterDisabled(address indexed asset);

    event AdapterPrimaryUpdated(
        address indexed asset,
        bool primary
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Configure a Chainlink AggregatorV3-compatible feed.
    /// @dev Existing Chainlink setup behavior is preserved.
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

    /// @notice Configure an alternate oracle adapter for an asset.
    /// @param primary If true, the adapter is attempted before Chainlink.
    ///        If false, Chainlink is attempted first and this adapter is
    ///        used only when Chainlink cannot provide a valid fresh price.
    function setAdapter(
        address asset,
        address adapter,
        uint32 maxStaleness,
        bool enabled,
        bool primary
    ) external onlyOwner {
        if (
            asset == address(0) ||
            adapter == address(0) ||
            adapter.code.length == 0
        ) {
            revert InvalidAdapter();
        }

        if (maxStaleness == 0 || maxStaleness > 30 days) {
            revert InvalidStaleness();
        }

        if (primary && !enabled) {
            revert InvalidAdapter();
        }

        adapters[asset] = AdapterConfig({
            adapter: adapter,
            maxStaleness: maxStaleness,
            enabled: enabled,
            primary: primary
        });

        emit AdapterConfigured(
            asset,
            adapter,
            maxStaleness,
            enabled,
            primary
        );
    }

    function disableAdapter(address asset) external onlyOwner {
        adapters[asset].enabled = false;
        adapters[asset].primary = false;
        emit AdapterDisabled(asset);
    }

    function setAdapterPrimary(address asset, bool primary) external onlyOwner {
        AdapterConfig storage config = adapters[asset];

        if (config.adapter == address(0) || !config.enabled) {
            revert InvalidAdapter();
        }

        config.primary = primary;
        emit AdapterPrimaryUpdated(asset, primary);
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
        AdapterConfig memory adapterConfig = adapters[asset];
        FeedConfig memory feedConfig = feeds[asset];

        // An explicitly-primary alternate provider gets first refusal.
        if (
            adapterConfig.enabled &&
            adapterConfig.primary &&
            adapterConfig.adapter != address(0)
        ) {
            (
                bool adapterValid,
                uint256 adapterPrice,
                uint256 adapterUpdatedAt
            ) = _tryGetAdapterPrice(asset, adapterConfig);

            if (adapterValid) {
                return (adapterPrice, adapterUpdatedAt);
            }
        }

        // Preserve the original Chainlink path as the default source.
        if (
            feedConfig.enabled &&
            feedConfig.feed != address(0) &&
            feedConfig.feedType == FeedType.Aggregator
        ) {
            (
                bool aggregatorValid,
                bool aggregatorStale,
                uint256 aggregatorPrice,
                uint256 aggregatorUpdatedAt
            ) = _tryGetAggregatorPrice(feedConfig);

            if (aggregatorValid) {
                return (aggregatorPrice, aggregatorUpdatedAt);
            }

            // A non-primary adapter is an explicit fallback for Chainlink.
            if (
                adapterConfig.enabled &&
                !adapterConfig.primary &&
                adapterConfig.adapter != address(0)
            ) {
                return _getAdapterPrice(asset, adapterConfig);
            }

            if (aggregatorStale) {
                revert StalePrice();
            }

            revert InvalidPrice();
        }

        // No usable Chainlink feed: use any configured adapter.
        if (
            adapterConfig.enabled &&
            adapterConfig.adapter != address(0)
        ) {
            return _getAdapterPrice(asset, adapterConfig);
        }

        revert AssetNotConfigured();
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

    function _tryGetAggregatorPrice(FeedConfig memory config)
        internal
        view
        returns (
            bool valid,
            bool stale,
            uint256 priceE18,
            uint256 updatedAt
        )
    {
        try IAggregatorV3(config.feed).latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 timestamp,
            uint80 answeredInRound
        ) {
            if (
                roundId == 0 ||
                answer <= 0 ||
                startedAt == 0 ||
                timestamp == 0 ||
                answeredInRound == 0 ||
                answeredInRound < roundId
            ) {
                return (false, false, 0, 0);
            }

            if (
                startedAt > block.timestamp ||
                timestamp > block.timestamp ||
                startedAt > timestamp
            ) {
                return (false, false, 0, 0);
            }

            if (block.timestamp - timestamp > config.maxStaleness) {
                return (false, true, 0, timestamp);
            }

            uint256 normalizedPrice =
                uint256(answer) * (10 ** (18 - config.feedDecimals));

            if (normalizedPrice == 0) {
                return (false, false, 0, 0);
            }

            return (true, false, normalizedPrice, timestamp);
        } catch {
            return (false, false, 0, 0);
        }
    }

    function _getAdapterPrice(
        address asset,
        AdapterConfig memory config
    ) internal view returns (uint256 priceE18, uint256 updatedAt) {
        if (!config.enabled || config.adapter == address(0)) {
            revert AssetNotConfigured();
        }

        try ICentryOracleAdapter(config.adapter).getPrice(asset) returns (
            uint256 adapterPriceE18,
            uint256 timestamp
        ) {
            if (
                adapterPriceE18 == 0 ||
                timestamp == 0 ||
                timestamp > block.timestamp
            ) {
                revert InvalidPrice();
            }

            if (block.timestamp - timestamp > config.maxStaleness) {
                revert StalePrice();
            }

            return (adapterPriceE18, timestamp);
        } catch (bytes memory reason) {
            if (reason.length == 0) {
                revert InvalidPrice();
            }

            assembly {
                revert(add(reason, 32), mload(reason))
            }
        }
    }

    function _tryGetAdapterPrice(
        address asset,
        AdapterConfig memory config
    )
        internal
        view
        returns (
            bool valid,
            uint256 priceE18,
            uint256 updatedAt
        )
    {
        try ICentryOracleAdapter(config.adapter).getPrice(asset) returns (
            uint256 adapterPriceE18,
            uint256 timestamp
        ) {
            if (
                adapterPriceE18 == 0 ||
                timestamp == 0 ||
                timestamp > block.timestamp ||
                block.timestamp - timestamp > config.maxStaleness
            ) {
                return (false, 0, timestamp);
            }

            return (true, adapterPriceE18, timestamp);
        } catch {
            return (false, 0, 0);
        }
    }
}
