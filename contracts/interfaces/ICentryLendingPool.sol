// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICentryLendingPool {
    function repayFor(
        address asset,
        address borrower,
        uint256 amount
    ) external returns (uint256 repaid);

    function borrowBalance(
        address user,
        address asset
    ) external view returns (uint256);

    function healthFactor(
        address user
    ) external view returns (uint256);
}
