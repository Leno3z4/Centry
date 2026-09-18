// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../core/CentryLendingPool.sol";
import "../core/CentryInterestRateStrategy.sol";
import "../interfaces/ICentryOracle.sol";

interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
    function expectRevert(bytes4 revertData) external;
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockOracle is ICentryOracle {
    mapping(address => uint256) public prices;
    uint256 public timestamp;

    function setPrice(address asset, uint256 priceE18) external {
        prices[asset] = priceE18;
        timestamp = block.timestamp;
    }

    function getPrice(address asset)
        external
        view
        returns (uint256 priceE18, uint256 updatedAt)
    {
        priceE18 = prices[asset];
        updatedAt = timestamp;
    }
}

contract CentryLendingPoolLiquidationTest {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    CentryLendingPool internal pool;
    MockOracle internal oracle;
    CentryInterestRateStrategy internal strategy;
    MockERC20 internal collateral;
    MockERC20 internal debt;

    address internal lender = address(0x1001);
    address internal borrower = address(0x1002);
    address internal liquidator = address(0x1003);

    uint256 internal constant COLLATERAL_AMOUNT = 100e18;
    uint256 internal constant DEBT_LIQUIDITY = 100e6;
    uint256 internal constant BORROW_AMOUNT = 70e6;
    uint256 internal constant LIQUIDATION_REPAYMENT = 35e6;

    function setUp() public {
        collateral = new MockERC20("Mock Collateral", "MCOL", 18);
        debt = new MockERC20("Mock USDC", "MUSDC", 6);
        oracle = new MockOracle();

        strategy = new CentryInterestRateStrategy(
            0,
            10e16,
            50e16,
            8e17,
            1e18
        );

        pool = new CentryLendingPool(
            address(this),
            address(oracle),
            address(strategy),
            address(this)
        );

        pool.addReserve(
            address(collateral),
            7000,
            7500,
            10500,
            1000,
            1_000e18,
            750e18
        );

        pool.addReserve(
            address(debt),
            7000,
            7500,
            10500,
            1000,
            1_000e6,
            750e6
        );

        collateral.mint(borrower, COLLATERAL_AMOUNT);
        debt.mint(lender, DEBT_LIQUIDITY);
        debt.mint(liquidator, LIQUIDATION_REPAYMENT);

        oracle.setPrice(address(collateral), 1e18);
        oracle.setPrice(address(debt), 1e18);

        vm.startPrank(lender);
        debt.approve(address(pool), DEBT_LIQUIDITY);
        pool.supply(address(debt), DEBT_LIQUIDITY);
        vm.stopPrank();

        vm.startPrank(borrower);
        collateral.approve(address(pool), COLLATERAL_AMOUNT);
        pool.supply(address(collateral), COLLATERAL_AMOUNT);
        pool.borrow(address(debt), BORROW_AMOUNT);
        vm.stopPrank();
    }

    function testLiquidationAfterCollateralPriceDrop() public {
        _assertTrue(pool.healthFactor(borrower) > 1e18, "borrower should start healthy");

        // Simulate a 50% collateral price drop on the local test oracle.
        oracle.setPrice(address(collateral), 5e17);

        _assertTrue(pool.healthFactor(borrower) < 1e18, "borrower should be liquidatable");

        uint256 borrowerDebtBefore = pool.borrowBalance(borrower, address(debt));
        uint256 borrowerCollateralBefore = pool.supplyBalance(
            borrower,
            address(collateral)
        );
        uint256 liquidatorCollateralBefore = collateral.balanceOf(liquidator);

        vm.startPrank(liquidator);
        debt.approve(address(pool), LIQUIDATION_REPAYMENT);
        pool.liquidate(
            address(collateral),
            address(debt),
            borrower,
            LIQUIDATION_REPAYMENT
        );
        vm.stopPrank();

        uint256 borrowerDebtAfter = pool.borrowBalance(borrower, address(debt));
        uint256 borrowerCollateralAfter = pool.supplyBalance(
            borrower,
            address(collateral)
        );
        uint256 liquidatorCollateralAfter = collateral.balanceOf(liquidator);

        _assertEq(
            borrowerDebtBefore - borrowerDebtAfter,
            LIQUIDATION_REPAYMENT,
            "liquidation should repay requested debt"
        );

        _assertEq(
            borrowerCollateralBefore - borrowerCollateralAfter,
            73_500000000000000000,
            "liquidation should seize 73.5 collateral"
        );

        _assertEq(
            liquidatorCollateralAfter - liquidatorCollateralBefore,
            73_500000000000000000,
            "liquidator should receive seized collateral"
        );
    }

    function testHealthyBorrowerCannotBeLiquidated() public {
        vm.expectRevert(CentryLendingPool.HealthFactorHealthy.selector);

        vm.prank(liquidator);
        pool.liquidate(
            address(collateral),
            address(debt),
            borrower,
            LIQUIDATION_REPAYMENT
        );
    }

    function _assertEq(
        uint256 actual,
        uint256 expected,
        string memory message
    ) internal pure {
        require(actual == expected, message);
    }

    function _assertTrue(bool condition, string memory message) internal pure {
        require(condition, message);
    }
}
