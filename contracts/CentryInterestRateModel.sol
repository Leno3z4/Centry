// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
    CentryInterestRateModel
    ─────────────────────────────────────────────────────────────────────────
    Kinked (two-slope) interest rate model.

    All rates are expressed as WAD (1e18) per SECOND so the LendingPool
    can multiply directly by elapsed seconds — no division by YEAR inside
    the pool, which keeps accrual math simple and gas-cheap.

    Borrow rate curve:

        rate
         │                                ╱  ← slope2 (steep)
         │                               ╱
         │              ╱‾‾‾‾‾‾‾‾‾‾‾‾‾╱
         │             ╱  ← slope1
         │            ╱
    base ├───────────╱
         │
         └────────────────────────────── utilization
                     ↑
                    kink (e.g. 0.80e18 = 80%)

    Below kink  → rate = base + slope1 * (u / kink)
    Above kink  → rate = base + slope1 + slope2 * ((u - kink) / (1 - kink))

    Recommended testnet values (constructor args, all PER YEAR in WAD):
        baseRate = 0.02e18   →  2%  base
        slope1   = 0.10e18   → 10%  at kink
        slope2   = 1.00e18   → 100% at 100% utilization
        kink     = 0.80e18   → 80%  optimal utilization

    Supply rate = borrow rate × utilization × (1 − reserveFactor)
    (protocol keeps reserveFactor share, rest goes to suppliers)
*/

contract CentryInterestRateModel {

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant WAD  = 1e18;
    uint256 public constant YEAR = 365 days; // 31_536_000 seconds

    /* ── Immutable params (set once at deploy, never change) ─────────────── */

    /// @notice Minimum borrow rate at 0% utilization (WAD/year).
    uint256 public immutable baseRatePerYear;

    /// @notice Extra rate added linearly from 0% → kink utilization (WAD/year).
    uint256 public immutable slope1PerYear;

    /// @notice Extra rate added linearly from kink → 100% utilization (WAD/year).
    uint256 public immutable slope2PerYear;

    /// @notice Utilization where the slope changes (WAD, e.g. 0.80e18 = 80%).
    uint256 public immutable kink;

    // Pre-computed per-second equivalents (avoids dividing by YEAR on every call)
    uint256 public immutable baseRatePerSecond;
    uint256 public immutable slope1PerSecond;
    uint256 public immutable slope2PerSecond;

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(
        uint256 baseRate_,   // WAD/year, e.g. 0.02e18
        uint256 slope1_,     // WAD/year, e.g. 0.10e18
        uint256 slope2_,     // WAD/year, e.g. 1.00e18
        uint256 kink_        // WAD,      e.g. 0.80e18
    ) {
        require(kink_ > 0 && kink_ < WAD, "irm: bad kink");
        require(slope2_ >= slope1_,        "irm: slope2 < slope1"); // must be steeper

        baseRatePerYear = baseRate_;
        slope1PerYear   = slope1_;
        slope2PerYear   = slope2_;
        kink            = kink_;

        // Store per-second rates — dividing once here saves gas on every accrual
        baseRatePerSecond = baseRate_ / YEAR;
        slope1PerSecond   = slope1_   / YEAR;
        slope2PerSecond   = slope2_   / YEAR;
    }

    /* ── Core math ───────────────────────────────────────────────────────── */

    /**
     * @notice Pool utilization rate.
     * @param cash    USDC currently sitting in the pool (not lent out).
     * @param borrows USDC currently borrowed.
     * @return Utilization in WAD (0 = 0%, 1e18 = 100%).
     */
    function utilization(uint256 cash, uint256 borrows)
        public
        pure
        returns (uint256)
    {
        if (borrows == 0) return 0;

        uint256 total = cash + borrows;
        if (total == 0) return 0;

        return borrows * WAD / total;
    }

    /**
     * @notice Per-second borrow rate at current pool state.
     * @return Rate in WAD/second (multiply by elapsed seconds to get interest factor).
     *
     * Example: rate = 0.000_000_003_170_979_198 (≈ 10% APY)
     *          over 1 year: 1e18 * rate * YEAR / WAD ≈ 0.10e18 (10%)
     */
    function borrowRatePerSecond(uint256 cash, uint256 borrows)
        public
        view
        returns (uint256)
    {
        uint256 u = utilization(cash, borrows);

        if (u <= kink) {
            // linear from baseRate to baseRate+slope1 as u goes 0→kink
            return baseRatePerSecond + (slope1PerSecond * u / kink);
        }

        // above kink: add steep slope2
        uint256 excess = u - kink;                // how far above kink
        uint256 range  = WAD - kink;              // remaining space (kink→100%)

        return
            baseRatePerSecond +
            slope1PerSecond +
            (slope2PerSecond * excess / range);
    }

    /**
     * @notice Per-second supply rate at current pool state.
     * @param reserveFactor Fraction of interest kept by protocol (WAD, e.g. 0.10e18 = 10%).
     * @return Rate in WAD/second.
     *
     * supplyRate = borrowRate × utilization × (1 − reserveFactor)
     * Suppliers only earn on the fraction of capital that is lent out.
     */
    function supplyRatePerSecond(
        uint256 cash,
        uint256 borrows,
        uint256 reserveFactor
    )
        public
        view
        returns (uint256)
    {
        require(reserveFactor < WAD, "irm: reserve >= 100%");

        uint256 u  = utilization(cash, borrows);
        uint256 br = borrowRatePerSecond(cash, borrows);

        return br * u / WAD * (WAD - reserveFactor) / WAD;
    }

    /* ── Convenience annualized views (for frontend display only) ────────── */

    /// @notice Borrow APY in WAD (e.g. 0.10e18 = 10%).  Do NOT use for accrual.
    function borrowAPY(uint256 cash, uint256 borrows)
        external
        view
        returns (uint256)
    {
        return borrowRatePerSecond(cash, borrows) * YEAR;
    }

    /// @notice Supply APY in WAD.  Do NOT use for accrual.
    function supplyAPY(uint256 cash, uint256 borrows, uint256 reserveFactor)
        external
        view
        returns (uint256)
    {
        return supplyRatePerSecond(cash, borrows, reserveFactor) * YEAR;
    }

    /// @notice Current utilization as a percentage (0–100, for UI).
    function utilizationPct(uint256 cash, uint256 borrows)
        external
        pure
        returns (uint256)
    {
        return utilization(cash, borrows) * 100 / WAD;
    }
}
