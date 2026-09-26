// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../core/CentryLendingPool.sol";
import "../core/CentryInterestRateStrategy.sol";
import "../mocks/CentryMockERC20.sol";
import "../mocks/CentryMockOracle.sol";
import "../agents/CentryOnchainAgentFactory.sol";
import "../agents/CentryOnchainAgentAccount.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
}

/// @title Centry Lending Pool Tests
/// @notice Foundry-compatible protocol tests with no forge-std dependency.
contract CentryLendingPoolTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant WAD = 1e18;
    uint256 internal constant YEAR = 365 days;

    CentryLendingPool internal pool;
    CentryInterestRateStrategy internal strategy;
    CentryMockOracle internal oracle;
    CentryMockERC20 internal collateral;
    CentryMockERC20 internal debt;

    address internal borrower = address(0xB0B);
    address internal liquidator = address(0x1E6);

    function setUp() public {
        oracle = new CentryMockOracle(address(this));
        strategy = new CentryInterestRateStrategy(0, 0.10e18, 0.90e18, 0.80e18, 1e18);
        collateral = new CentryMockERC20("Collateral", "COL", 18, address(this));
        debt = new CentryMockERC20("Debt", "DEBT", 18, address(this));

        pool = new CentryLendingPool(address(this), address(oracle), address(strategy), address(this));

        pool.addReserve(address(collateral), 7500, 8000, 10500, 1000, 1_500e18, 1_000e18);
        pool.addReserve(address(debt), 7500, 8000, 10500, 1000, 1_500e18, 1_000e18);

        oracle.setPrice(address(collateral), WAD);
        oracle.setPrice(address(debt), WAD);

        collateral.mint(address(this), 2_000e18);
        collateral.mint(borrower, 2_000e18);
        debt.mint(address(this), 2_000e18);
        debt.mint(liquidator, 2_000e18);
    }

    function testAgentFinancialLimitIsEnforcedAndResets() external {
        CentryOnchainAgentFactory factory = new CentryOnchainAgentFactory();
        address operator = address(0xA11CE);

        factory.createAgentAccount(
            bytes32("security"),
            bytes32(0),
            "",
            operator
        );

        address agentAddress = factory.getAgentAccounts(address(this))[0];
        CentryOnchainAgentAccount agent = CentryOnchainAgentAccount(payable(agentAddress));
        agent.setActive(true);

        bytes4 approveSelector = bytes4(keccak256("approve(address,uint256)"));
        uint64 permissionExpiry = uint64(block.timestamp + 3 days);
        agent.setPermission(
            operator,
            address(debt),
            approveSelector,
            true,
            permissionExpiry,
            0
        );
        agent.setFinancialLimit(
            operator,
            address(debt),
            approveSelector,
            address(debt),
            100e18,
            150e18,
            1 days
        );

        agent.setApprovalSpender(operator, address(debt), address(pool), true);

        bytes memory approve100 = abi.encodeWithSelector(
            approveSelector,
            address(pool),
            100e18
        );

        vm.prank(operator);
        agent.execute(address(debt), 0, approve100);

        bytes memory approve51 = abi.encodeWithSelector(
            approveSelector,
            address(pool),
            51e18
        );
        vm.prank(operator);
        (bool windowExceeded,) = address(agent).call(
            abi.encodeWithSelector(
                agent.execute.selector,
                address(debt),
                0,
                approve51
            )
        );
        _assertFalse(windowExceeded);

        bytes memory approve101 = abi.encodeWithSelector(
            approveSelector,
            address(pool),
            101e18
        );
        vm.prank(operator);
        (bool callExceeded,) = address(agent).call(
            abi.encodeWithSelector(
                agent.execute.selector,
                address(debt),
                0,
                approve101
            )
        );
        _assertFalse(callExceeded);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(operator);
        agent.execute(address(debt), 0, approve100);
    }

    function testSupplyAndWithdraw() external {
        pool.supply(address(collateral), 1_000e18);
        _assertEq(pool.supplyBalance(address(this), address(collateral)), 1_000e18);

        uint256 withdrawn = pool.withdraw(address(collateral), 250e18);
        _assertEq(withdrawn, 250e18);
        _assertEq(pool.supplyBalance(address(this), address(collateral)), 750e18);
    }

    function testBorrowRespectsLtvAndRepayMax() external {
        pool.supply(address(collateral), 1_000e18);
        pool.supply(address(debt), 1_000e18);

        vm.prank(borrower);
        collateral.approve(address(pool), 1_000e18);
        vm.prank(borrower);
        pool.supply(address(collateral), 1_000e18);

        vm.prank(borrower);
        pool.borrow(address(debt), 700e18);
        _assertEq(pool.borrowBalance(borrower, address(debt)), 700e18);

        vm.prank(borrower);
        debt.approve(address(pool), type(uint256).max);
        vm.prank(borrower);
        uint256 repaid = pool.repay(address(debt), type(uint256).max);
        _assertEq(repaid, 700e18);
        _assertEq(pool.borrowBalance(borrower, address(debt)), 0);
    }

    function testBorrowAboveLtvReverts() external {
        pool.supply(address(collateral), 1_000e18);
        pool.supply(address(debt), 1_000e18);

        vm.prank(borrower);
        collateral.approve(address(pool), 1_000e18);
        vm.prank(borrower);
        pool.supply(address(collateral), 1_000e18);

        vm.prank(borrower);
        (bool ok,) = address(pool).call(abi.encodeCall(pool.borrow, (address(debt), 751e18)));
        _assertFalse(ok);
    }

    function testLiquidationRespectsCloseFactorAndTransfersCollateral() external {
        pool.supply(address(debt), 1_000e18);

        vm.prank(borrower);
        collateral.approve(address(pool), 1_000e18);
        vm.prank(borrower);
        pool.supply(address(collateral), 1_000e18);
        vm.prank(borrower);
        pool.borrow(address(debt), 700e18);

        oracle.setPrice(address(collateral), 0.60e18);
        _assertLt(pool.healthFactor(borrower), WAD);

        uint256 liquidatorCollateralBefore = collateral.balanceOf(liquidator);
        vm.prank(liquidator);
        debt.approve(address(pool), 400e18);
        vm.prank(liquidator);
        pool.liquidate(address(collateral), address(debt), borrower, 400e18);

        _assertEq(pool.borrowBalance(borrower, address(debt)), 350e18);
        _assertGt(collateral.balanceOf(liquidator), liquidatorCollateralBefore);
    }

    function testLiquidationHealthyPositionReverts() external {
        pool.supply(address(debt), 1_000e18);

        vm.prank(borrower);
        collateral.approve(address(pool), 1_000e18);
        vm.prank(borrower);
        pool.supply(address(collateral), 1_000e18);
        vm.prank(borrower);
        pool.borrow(address(debt), 700e18);

        vm.prank(liquidator);
        debt.approve(address(pool), 100e18);
        vm.prank(liquidator);
        (bool ok,) = address(pool).call(
            abi.encodeCall(pool.liquidate, (address(collateral), address(debt), borrower, 100e18))
        );
        _assertFalse(ok);
    }

    function testCapsAndPause() external {
        pool.supply(address(collateral), 1_500e18);
        (bool ok,) = address(pool).call(abi.encodeCall(pool.supply, (address(collateral), 1)));
        _assertFalse(ok);

        pool.pause();
        (ok,) = address(pool).call(abi.encodeCall(pool.supply, (address(collateral), 1e18)));
        _assertFalse(ok);
        pool.unpause();

        pool.supply(address(debt), 1_000e18);
        _assertGt(pool.utilization(address(debt)), 0);
    }

    function testAccrualUpdatesIndexes() external {
        pool.supply(address(collateral), 1_000e18);
        pool.supply(address(debt), 1_000e18);

        vm.prank(borrower);
        collateral.approve(address(pool), 1_000e18);
        vm.prank(borrower);
        pool.supply(address(collateral), 1_000e18);
        vm.prank(borrower);
        pool.borrow(address(debt), 500e18);

        (uint256 oldLiquidityIndex, uint256 oldBorrowIndex,,,) = pool.getReserveState(address(debt));
        vm.warp(block.timestamp + YEAR);
        pool.supply(address(debt), 1e18);
        (uint256 newLiquidityIndex, uint256 newBorrowIndex,,,) = pool.getReserveState(address(debt));

        _assertGt(newBorrowIndex, oldBorrowIndex);
        _assertGt(newLiquidityIndex, oldLiquidityIndex);
    }

    function testSweepCannotConsumeSupplierCoverage() external {
        pool.supply(address(debt), 1_000e18);
        (bool ok,) = address(pool).call(abi.encodeCall(pool.sweepProtocolFees, (address(debt), 1)));
        _assertFalse(ok);
    }

    function _assertEq(uint256 a, uint256 b) internal pure {
        if (a != b) revert AssertionFailed();
    }

    function _assertGt(uint256 a, uint256 b) internal pure {
        if (a <= b) revert AssertionFailed();
    }

    function _assertLt(uint256 a, uint256 b) internal pure {
        if (a >= b) revert AssertionFailed();
    }

    function _assertFalse(bool value) internal pure {
        if (value) revert AssertionFailed();
    }

    error AssertionFailed();
}
