// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/*
    CentryOracle
    ─────────────────────────────────────────────────────────────────────────
    Manual price oracle for Arc testnet.

    On mainnet, replace the CentryOracleManual implementation with
    CentryOracleChainlink (same ICentryOracle interface) — no other
    contract needs to change.

    Price format: USD value with `decimals` decimal places.
    Example: ETH = $3000 → value = 3000_00000000, decimals = 8
    Example: USDC = $1  → value =       1_00000000, decimals = 8
    Example: USYC = $1.05 → value =  1_05000000, decimals = 8
*/


/* ── Interface (what LendingPool + Vault import) ─────────────────────────── */

interface ICentryOracle {
    /// @notice Returns (price, decimals) for `asset`.
    ///         Reverts if price is missing or stale.
    function getPrice(address asset)
        external
        view
        returns (uint256 price, uint8 decimals);
}


/* ── Manual oracle (testnet) ─────────────────────────────────────────────── */

contract CentryOracleManual is ICentryOracle, Ownable2Step {

    struct PriceEntry {
        uint256 value;       // price with `decimals` precision
        uint8   decimals;    // e.g. 8 for Chainlink-style
        uint40  updatedAt;   // block.timestamp when set (fits in uint40 until year 36812)
    }

    // asset → price data
    mapping(address => PriceEntry) private _prices;

    // Maximum age of a price before getPrice() reverts
    // Default 1 hour. Owner can extend for illiquid testnet assets.
    uint256 public maxPriceAge = 1 hours;

    event PriceSet(
        address indexed asset,
        uint256 value,
        uint8   decimals,
        uint256 timestamp
    );
    event MaxPriceAgeUpdated(uint256 newAge);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /* ── Admin ─────────────────────────────────────────────────────────── */

    /// @notice Set or update the price for an asset.
    /// @param asset    Token address (cannot be zero).
    /// @param value    Price in USD with `decimals` places.
    /// @param decimals Precision (recommend 8 to match Chainlink).
    function setPrice(
        address asset,
        uint256 value,
        uint8   decimals
    ) external onlyOwner {
        require(asset   != address(0), "oracle: zero asset");
        require(value   >  0,          "oracle: zero price");
        require(decimals > 0,          "oracle: zero decimals");

        _prices[asset] = PriceEntry({
            value:     value,
            decimals:  decimals,
            updatedAt: uint40(block.timestamp)
        });

        emit PriceSet(asset, value, decimals, block.timestamp);
    }

    /// @notice Batch-set prices in one tx (saves gas on testnet resets).
    function setPriceBatch(
        address[] calldata assets,
        uint256[] calldata values,
        uint8[]   calldata decimalsArr
    ) external onlyOwner {
        uint256 len = assets.length;
        require(len == values.length && len == decimalsArr.length, "oracle: length mismatch");

        for (uint256 i; i < len; ++i) {
            require(assets[i] != address(0), "oracle: zero asset");
            require(values[i] >  0,          "oracle: zero price");

            _prices[assets[i]] = PriceEntry({
                value:     values[i],
                decimals:  decimalsArr[i],
                updatedAt: uint40(block.timestamp)
            });

            emit PriceSet(assets[i], values[i], decimalsArr[i], block.timestamp);
        }
    }

    function setMaxPriceAge(uint256 age) external onlyOwner {
        require(age >= 1 minutes, "oracle: age too short");
        maxPriceAge = age;
        emit MaxPriceAgeUpdated(age);
    }

    /* ── View ──────────────────────────────────────────────────────────── */

    /// @inheritdoc ICentryOracle
    function getPrice(address asset)
        external
        view
        override
        returns (uint256 price, uint8 decimals)
    {
        PriceEntry memory p = _prices[asset];

        require(p.value     > 0,                               "oracle: no price");
        require(block.timestamp - p.updatedAt <= maxPriceAge,  "oracle: stale price");

        return (p.value, p.decimals);
    }

    /// @notice Read raw entry without staleness check (useful for UI display).
    function getRaw(address asset)
        external
        view
        returns (uint256 value, uint8 decimals, uint256 updatedAt)
    {
        PriceEntry memory p = _prices[asset];
        return (p.value, p.decimals, p.updatedAt);
    }
}


/*
    ─────────────────────────────────────────────────────────────────────────
    CentryOracleChainlink  (mainnet adapter — deploy when ready)
    ─────────────────────────────────────────────────────────────────────────
    Uncomment and deploy this instead of CentryOracleManual on mainnet.
    Plug the address into LendingPool.setOracle() — zero code changes
    to any other contract.

    interface AggregatorV3Interface {
        function latestRoundData() external view returns (
            uint80  roundId,
            int256  answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80  answeredInRound
        );
        function decimals() external view returns (uint8);
    }

    contract CentryOracleChainlink is ICentryOracle, Ownable2Step {
        mapping(address => address) public feeds;   // asset → Chainlink feed
        uint256 public maxPriceAge = 1 hours;

        constructor(address initialOwner) Ownable(initialOwner) {}

        function setFeed(address asset, address feed) external onlyOwner {
            require(asset != address(0) && feed != address(0), "zero");
            feeds[asset] = feed;
        }

        function getPrice(address asset)
            external
            view
            override
            returns (uint256, uint8)
        {
            address feed = feeds[asset];
            require(feed != address(0), "oracle: no feed");

            AggregatorV3Interface agg = AggregatorV3Interface(feed);
            (
                uint80  roundId,
                int256  answer,
                ,
                uint256 updatedAt,
                uint80  answeredInRound
            ) = agg.latestRoundData();

            require(answer       > 0,              "oracle: non-positive price");
            require(updatedAt    > 0,              "oracle: round not complete");
            require(answeredInRound >= roundId,    "oracle: stale round");
            require(
                block.timestamp - updatedAt <= maxPriceAge,
                "oracle: stale price"
            );

            return (uint256(answer), agg.decimals());
        }
    }
*/
