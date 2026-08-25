// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Immutable two-slope utilization model.
contract CentryInterestRateStrategy {
    uint256 public constant WAD = 1e18;
    uint256 public immutable baseRatePerYear;
    uint256 public immutable slope1PerYear;
    uint256 public immutable slope2PerYear;
    uint256 public immutable kink;
    uint256 public immutable maxRatePerYear;

    error InvalidParameters();
    error RateExceedsMaximum();

    constructor(uint256 baseRatePerYear_, uint256 slope1PerYear_, uint256 slope2PerYear_, uint256 kink_, uint256 maxRatePerYear_) {
        if (kink_ == 0 || kink_ >= WAD || maxRatePerYear_ == 0) revert InvalidParameters();
        if (baseRatePerYear_ + slope1PerYear_ + slope2PerYear_ > maxRatePerYear_) revert InvalidParameters();
        baseRatePerYear = baseRatePerYear_; slope1PerYear = slope1PerYear_; slope2PerYear = slope2PerYear_; kink = kink_; maxRatePerYear = maxRatePerYear_;
    }

    function getBorrowRate(uint256 utilization) public view returns (uint256) {
        if (utilization > WAD) utilization = WAD;
        uint256 rate;
        if (utilization <= kink) rate = baseRatePerYear + (slope1PerYear * utilization) / kink;
        else rate = baseRatePerYear + slope1PerYear + (slope2PerYear * (utilization - kink)) / (WAD - kink);
        if (rate > maxRatePerYear) revert RateExceedsMaximum();
        return rate;
    }
}
