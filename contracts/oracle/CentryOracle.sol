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

interface IBandStdReference {
    struct ReferenceData {
        uint256 rate;
        uint256 lastUpdatedBase;
        uint256 lastUpdatedQuote;
    }

    function getReferenceData(
        string calldata baseSymbol,
        string calldata quoteSymbol
    )
        external
        view
        returns (ReferenceData memory);
}

interface IPythCentry {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }

    function getPriceUnsafe(
        bytes32 id
    )
        external
        view
        returns (Price memory price);

    function getUpdateFee(
        bytes[] calldata updateData
    )
        external
        view
        returns (uint fee);

    function updatePriceFeeds(
        bytes[] calldata updateData
    )
        external
        payable;
}

/// @title Centry Oracle
/// @notice Multi-provider USD oracle adapter with explicit staleness bounds.
/// @dev Prices returned by getPrice() are normalized to 1e18.
contract CentryOracle is Ownable2Step, Pausable {
    struct FeedConfig {
        address feed;
        uint32 maxStaleness;
        bool enabled;
    }

    struct BandFeedConfig {
        address bandReference;
        string baseSymbol;
        string quoteSymbol;
        uint32 maxStaleness;
        bool enabled;
    }

    struct PythFeedConfig {
        bytes32 priceId;
        uint32 maxStaleness;
        bool enabled;
    }

    mapping(address => FeedConfig) public feeds;
    mapping(address => BandFeedConfig) public bandFeeds;
    mapping(address => PythFeedConfig) public pythFeeds;

    address public pyth;

    error AssetNotConfigured();
    error InvalidFeed();
    error InvalidPrice();
    error InvalidStaleness();
    error StalePrice();
    error PythNotConfigured();
    error PythUpdateFailed();
    error PythPriceOverflow();

    event FeedConfigured(
        address indexed asset,
        address indexed feed,
        uint32 maxStaleness,
        bool enabled
    );

    event FeedDisabled(address indexed asset);

    event BandFeedConfigured(
        address indexed asset,
        address indexed bandReference,
        string baseSymbol,
        string quoteSymbol,
        uint32 maxStaleness,
        bool enabled
    );

    event BandFeedDisabled(address indexed asset);

    event PythConfigured(address indexed pyth);

    event PythFeedConfigured(
        address indexed asset,
        bytes32 indexed priceId,
        uint32 maxStaleness,
        bool enabled
    );

    event PythFeedDisabled(address indexed asset);

    constructor(address initialOwner)
        Ownable(initialOwner)
    {}

    function setFeed(
        address asset,
        address feed,
        uint32 maxStaleness,
        bool enabled
    ) external onlyOwner {
        _validateCommon(asset, feed, maxStaleness);

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

    function setBandFeed(
        address asset,
        address bandReference,
        string calldata baseSymbol,
        string calldata quoteSymbol,
        uint32 maxStaleness,
        bool enabled
    ) external onlyOwner {
        _validateCommon(
            asset,
            bandReference,
            maxStaleness
        );

        if (
            bytes(baseSymbol).length == 0 ||
            bytes(quoteSymbol).length == 0
        ) {
            revert InvalidFeed();
        }

        IBandStdReference(bandReference).getReferenceData(
            baseSymbol,
            quoteSymbol
        );

        bandFeeds[asset] = BandFeedConfig({
            bandReference: bandReference,
            baseSymbol: baseSymbol,
            quoteSymbol: quoteSymbol,
            maxStaleness: maxStaleness,
            enabled: enabled
        });

        emit BandFeedConfigured(
            asset,
            bandReference,
            baseSymbol,
            quoteSymbol,
            maxStaleness,
            enabled
        );
    }

    function setPyth(
        address pythAddress
    ) external onlyOwner {
        if (pythAddress == address(0)) {
            revert PythNotConfigured();
        }

        pyth = pythAddress;

        emit PythConfigured(pythAddress);
    }

    function setPythFeed(
        address asset,
        bytes32 priceId,
        uint32 maxStaleness,
        bool enabled
    ) external onlyOwner {
        if (asset == address(0) || priceId == bytes32(0)) {
            revert InvalidFeed();
        }

        if (
            maxStaleness == 0 ||
            maxStaleness > 30 days
        ) {
            revert InvalidStaleness();
        }

        if (pyth == address(0)) {
            revert PythNotConfigured();
        }

        pythFeeds[asset] = PythFeedConfig({
            priceId: priceId,
            maxStaleness: maxStaleness,
            enabled: enabled
        });

        emit PythFeedConfigured(
            asset,
            priceId,
            maxStaleness,
            enabled
        );
    }

    function updatePythPrices(
        bytes[] calldata priceUpdate
    ) external payable {
        if (pyth == address(0)) {
            revert PythNotConfigured();
        }

        uint fee = IPythCentry(pyth).getUpdateFee(
            priceUpdate
        );

        if (msg.value != fee) {
            revert PythUpdateFailed();
        }

        IPythCentry(pyth).updatePriceFeeds{value: fee}(
            priceUpdate
        );
    }

    function getPythUpdateFee(
        bytes[] calldata priceUpdate
    ) external view returns (uint256) {
        if (pyth == address(0)) {
            revert PythNotConfigured();
        }

        return IPythCentry(pyth).getUpdateFee(
            priceUpdate
        );
    }

    function disableFeed(
        address asset
    ) external onlyOwner {
        feeds[asset].enabled = false;
        emit FeedDisabled(asset);
    }

    function disableBandFeed(
        address asset
    ) external onlyOwner {
        bandFeeds[asset].enabled = false;
        emit BandFeedDisabled(asset);
    }

    function disablePythFeed(
        address asset
    ) external onlyOwner {
        pythFeeds[asset].enabled = false;
        emit PythFeedDisabled(asset);
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
        PythFeedConfig memory pythConfig = pythFeeds[asset];

        if (
            pythConfig.enabled &&
            pyth != address(0)
        ) {
            return _getPythPrice(pythConfig);
        }

        BandFeedConfig memory bandConfig = bandFeeds[asset];

        if (
            bandConfig.enabled &&
            bandConfig.bandReference != address(0)
        ) {
            return _getBandPrice(bandConfig);
        }

        FeedConfig memory config = feeds[asset];

        if (
            !config.enabled ||
            config.feed == address(0)
        ) {
            revert AssetNotConfigured();
        }

        return _getAggregatorPrice(config);
    }

    function _getPythPrice(
        PythFeedConfig memory config
    ) internal view returns (
        uint256 priceE18,
        uint256 updatedAt
    ) {
        IPythCentry.Price memory price =
            IPythCentry(pyth).getPriceUnsafe(
                config.priceId
            );

        if (price.price <= 0 || price.publishTime == 0) {
            revert InvalidPrice();
        }

        if (
            price.publishTime > block.timestamp ||
            block.timestamp - price.publishTime >
            config.maxStaleness
        ) {
            revert StalePrice();
        }

        uint256 unsignedPrice = uint256(
            uint64(price.price)
        );
        int256 exponent = int256(price.expo);

        if (exponent >= 0) {
            if (exponent > 18) {
                revert PythPriceOverflow();
            }

            priceE18 = unsignedPrice *
                (10 ** uint256(exponent + 18));
        } else {
            int256 scale = 18 + exponent;

            if (scale >= 0) {
                priceE18 = unsignedPrice *
                    (10 ** uint256(scale));
            } else {
                int256 divisorPower = -scale;

                if (divisorPower > 77) {
                    revert PythPriceOverflow();
                }

                priceE18 = unsignedPrice /
                    (10 ** uint256(divisorPower));
            }
        }

        if (priceE18 == 0) {
            revert InvalidPrice();
        }

        updatedAt = price.publishTime;
    }

    function _getBandPrice(
        BandFeedConfig memory config
    ) internal view returns (
        uint256 priceE18,
        uint256 updatedAt
    ) {
        IBandStdReference.ReferenceData memory data =
            IBandStdReference(config.bandReference)
                .getReferenceData(
                    config.baseSymbol,
                    config.quoteSymbol
                );

        if (data.rate == 0) {
            revert InvalidPrice();
        }

        updatedAt = data.lastUpdatedBase <
            data.lastUpdatedQuote
            ? data.lastUpdatedBase
            : data.lastUpdatedQuote;

        if (updatedAt == 0) {
            revert InvalidPrice();
        }

        if (
            updatedAt > block.timestamp ||
            block.timestamp - updatedAt >
            config.maxStaleness
        ) {
            revert StalePrice();
        }

        priceE18 = data.rate;

        if (priceE18 == 0) {
            revert InvalidPrice();
        }
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
            block.timestamp - timestamp >
            config.maxStaleness
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

    function _validateCommon(
        address asset,
        address source,
        uint32 maxStaleness
    ) internal pure {
        if (
            asset == address(0) ||
            source == address(0)
        ) {
            revert InvalidFeed();
        }

        if (
            maxStaleness == 0 ||
            maxStaleness > 30 days
        ) {
            revert InvalidStaleness();
        }
    }
}
