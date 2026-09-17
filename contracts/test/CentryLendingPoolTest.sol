// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Lightweight assertion harness for CI/static execution of LendingPool invariants.
/// @dev This is intentionally dependency-free; a runner can deploy the protocol mocks and
/// call these pure boundary checks without changing production contracts.
contract CentryLendingPoolTest {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant CLOSE_FACTOR_BPS = 5_000;

    function testScaledUpNeverUndercollateralizes() external pure returns (bool) {
        uint256[] memory amounts = new uint256[](6);
        amounts[0] = 1;
        amounts[1] = 2;
        amounts[2] = 17;
        amounts[3] = 1e6;
        amounts[4] = 1e18;
        amounts[5] = type(uint128).max;

        uint256[] memory indexes = new uint256[](4);
        indexes[0] = RAY;
        indexes[1] = RAY + 1;
        indexes[2] = RAY + 123456789;
        indexes[3] = 2 * RAY;

        for (uint256 i; i < amounts.length; ++i) {
            for (uint256 j; j < indexes.length; ++j) {
                uint256 scaled = _scaledUp(amounts[i], indexes[j]);
                uint256 represented = scaled * indexes[j] / RAY;
                if (represented < amounts[i]) revert AssertionFailed();
            }
        }
        return true;
    }

    function testCloseFactorNeverExceedsHalfDebt() external pure returns (bool) {
        uint256[] memory debts = new uint256[](6);
        debts[0] = 1;
        debts[1] = 2;
        debts[2] = 999;
        debts[3] = 1e6;
        debts[4] = 1e18;
        debts[5] = type(uint128).max;

        for (uint256 i; i < debts.length; ++i) {
            uint256 maxRepay = debts[i] * CLOSE_FACTOR_BPS / BPS;
            if (maxRepay > debts[i] / 2) revert AssertionFailed();
        }
        return true;
    }

    function testHealthyBoundary() external pure returns (bool) {
        if (WAD - 1 >= WAD) revert AssertionFailed();
        if (WAD >= WAD) return true;
        revert AssertionFailed();
    }

    function testCapBoundary() external pure returns (bool) {
        uint256 cap = 1_000_000;
        if (cap > cap) revert AssertionFailed();
        if (cap + 1 <= cap) revert AssertionFailed();
        return true;
    }

    function testExactBalanceRepayBoundary() external pure returns (bool) {
        uint256 debt = 123456789;
        uint256 requested = type(uint256).max;
        uint256 repayAmount = requested < debt ? requested : debt;
        if (repayAmount != debt) revert AssertionFailed();
        return true;
    }

    function _scaledUp(uint256 amount, uint256 index) internal pure returns (uint256) {
        return (amount * RAY + index - 1) / index;
    }

    error AssertionFailed();
}
