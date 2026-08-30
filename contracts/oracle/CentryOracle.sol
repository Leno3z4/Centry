// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/access/Ownable2Step.sol";
import "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.4.0/contracts/utils/Pausable.sol";

interface IAggregatorV3 {
    function decimals()
        external
        view
        returns (uint8);

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

interface IChronicle {
    function read()
        external
        view
        returns (uint256 value);

    function readWithAge()
        external
        view
        returns (uint256 value, uint256 age);

    function tryReadWithAge()
        external
        view
        returns (
            bool ok,
            uint256 value,
            uint256 age
        );
}

interface ISelfKisser {
    function selfKiss(
        address oracle
    )
        external;
}

/// @title Centry Oracle
/// @notice Multi-asset oracle adapter with native Chronicle support.
/// @dev Chronicle feeds use 18 decimals and readWithAge().
///      Legacy Chainlink-style feeds remain supported for flexibility.
contract CentryOracle is Ownable2Step, Pausable {
    enum FeedType {
        None,
        Chronicle,
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

    ISelfKisser public immutable selfKisser;

    error AssetNotConfigured();
    error InvalidFeed();
    error InvalidPrice();
    error InvalidStaleness();
    error StalePrice();
    error UnauthorizedSelfKisser();

    event FeedConfigured(
        address indexed asset,
        address indexed feed,
        FeedType feedType,
        uint8 feedDecimals,
        uint32 maxStaleness,
        bool enabled
    );

    event FeedDisabled(
        address indexed asset
    );

    event ChronicleFeedWhitelisted(
        address indexed oracle,
        address indexed selfKisser
    );

    constructor(
        address initialOwner,
        address selfKisserAddress
    ) Ownable(initialOwner) {
        if (selfKisserAddress == address(0)) {
            revert InvalidFeed();
        }

        selfKisser = ISelfKisser(selfKisserAddress);
    }

    function setChronicleFeed(
        address asset,
        address chronicle,
        uint32 maxStaleness,
        bool enabled
    ) external onlyOwner {
        if (
            asset == address(0) ||
            chronicle == address(0)
        ) {
            revert InvalidFeed();
        }

        if (
            maxStaleness == 0 ||
            maxStaleness > 30 days
        ) {
            revert InvalidStaleness();
        }

        // Chronicle testnet uses SelfKisser to whitelist the calling
        // contract. This external call originates from CentryOracle,
        // so CentryOracle becomes the whitelisted reader.
        selfKisser.selfKiss(chronicle);

        (
            bool ok,
            uint256 value,
            uint256 age
        ) = IChronicle(chronicle).tryReadWithAge();

        if (
            !ok ||
            value == 0 ||
            age == 0
        ) {
            revert InvalidPrice();
        }

        feeds[asset] = FeedConfig({
            feed: chronicle,
            feedDecimals: 18,
            maxStaleness: maxStaleness,
            feedType: FeedType.Chronicle,
            enabled: enabled
        });

        emit FeedConfigured(
            asset,
            chronicle,
            FeedType.Chronicle,
            18,
            maxStaleness,
            enabled
        );

        emit ChronicleFeedWhitelisted(
            chronicle,
            address(selfKisser)
        );
    }

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
            config.feed == address(0) ||
            config.feedType == FeedType.None
        ) {
            revert AssetNotConfigured();
        }

        if (config.feedType == FeedType.Chronicle) {
            return _getChroniclePrice(config);
        }

        if (config.feedType == FeedType.Aggregator) {
            return _getAggregatorPrice(config);
        }

        revert AssetNotConfigured();
    }

    function _getChroniclePrice(
        FeedConfig memory config
    ) internal view returns (
        uint256 priceE18,
        uint256 updatedAt
    ) {
        (
            uint256 value,
            uint256 age
        ) = IChronicle(config.feed).readWithAge();

        if (value == 0 || age == 0) {
            revert InvalidPrice();
        }

        if (
            age > block.timestamp ||
            block.timestamp - age > config.maxStaleness
        ) {
            revert StalePrice();
        }

        priceE18 = value;
        updatedAt = age;
    }

    function _getAggregatorPrice(
        FeedConfig memory config
    ) internal view returns (
        uint256 priceE18,
        uint256 updatedAt
    ) {
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

        priceE18 = uint256(answer) *
            (10 ** (18 - config.feedDecimals));

        if (priceE18 == 0) {
            revert InvalidPrice();
        }

        updatedAt = timestamp;
    }
}
