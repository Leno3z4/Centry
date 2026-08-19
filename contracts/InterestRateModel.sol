// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract InterestRateModel {
    uint256 public immutable baseRate;
    uint256 public immutable slope1;
    uint256 public immutable slope2;
    uint256 public immutable kink;
    constructor(uint256 _baseRate, uint256 _slope1, uint256 _slope2, uint256 _kink) {
        require(_kink > 0 && _kink < 1e27, "INVALID_KINK");
        baseRate = _baseRate; slope1 = _slope1; slope2 = _slope2; kink = _kink;
    }
    function getBorrowRate(uint256 borrows, uint256 cash) external view returns (uint256) {
        uint256 total = borrows + cash; if (total == 0) return baseRate;
        uint256 u = (borrows * 1e27) / total;
        if (u <= kink) return baseRate + (u * slope1) / kink;
        return baseRate + slope1 + ((u - kink) * slope2) / (1e27 - kink);
    }
}
