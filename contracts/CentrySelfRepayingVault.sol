// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

interface ICentryLendingPool {
    function usdc() external view returns (address);
    function supplyCollateral(address asset, uint256 amount, address onBehalfOf) external;
    function withdrawCollateralFor(address user, address asset, uint256 amount, address recipient) external;
    function borrowFor(address onBehalfOf, uint256 amount, address recipient) external;
    function repayFor(address onBehalfOf, uint256 amount) external returns (uint256);
    function liquidate(address borrower, address collateralAsset, uint256 debtAmount) external;
    function collateralBalances(address user, address asset) external view returns (uint256);
    function debtOf(address user) external view returns (uint256);
    function healthFactor(address user) external view returns (uint256);
    function borrowCapacity(address user) external view returns (uint256);
}

/**
 * CentrySelfRepayingVault
 *
 * Strategy layer on top of CentryLendingPool.
 *
 * User flow:
 *   USYC -> Vault -> LendingPool collateral
 *   LendingPool -> USDC borrow -> User
 *   USYC yield -> Keeper converts yield to USDC -> Keeper calls harvestAndRepay
 *   Vault -> LendingPool repayFor(user) -> user's debt falls
 *
 * The vault no longer maintains a second USDC lending pool. The LendingPool
 * is the single source of truth for collateral, debt, health and liquidity.
 */
contract CentrySelfRepayingVault is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant WAD = 1e18;

    IERC20 public immutable usyc;
    IERC20 public immutable usdc;
    ICentryLendingPool public immutable lendingPool;

    address public keeper;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, address indexed payer, uint256 amount);
    event HarvestRepaid(address indexed user, uint256 usdcAmount);
    event Liquidated(address indexed liquidator, address indexed borrower, uint256 usdcRepaid, uint256 usycSeized);
    event KeeperUpdated(address indexed keeper);

    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "vault: not keeper");
        _;
    }

    constructor(
        address initialOwner,
        address usyc_,
        address lendingPool_
    ) Ownable(initialOwner) {
        require(usyc_ != address(0), "vault: usyc=0");
        require(lendingPool_ != address(0), "vault: pool=0");

        usyc = IERC20(usyc_);
        lendingPool = ICentryLendingPool(lendingPool_);
        usdc = IERC20(ICentryLendingPool(lendingPool_).usdc());
    }

    function setKeeper(address keeper_) external onlyOwner {
        require(keeper_ != address(0), "vault: keeper=0");
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * Deposit USYC into the LendingPool and credit it to the user's address.
     * User approves this vault for USYC before calling.
     */
    function depositCollateral(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "vault: amount=0");

        usyc.safeTransferFrom(msg.sender, address(this), amount);
        usyc.forceApprove(address(lendingPool), amount);
        lendingPool.supplyCollateral(address(usyc), amount, msg.sender);

        emit CollateralDeposited(msg.sender, amount);
    }

    /**
     * Withdraw collateral from the LendingPool to the user.
     */
    function withdrawCollateral(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "vault: amount=0");
        require(lendingPool.collateralBalances(msg.sender, address(usyc)) >= amount, "vault: insufficient collateral");

        lendingPool.withdrawCollateralFor(msg.sender, address(usyc), amount, address(this));
        usyc.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * Borrow USDC through the Centry LendingPool against the user's USYC.
     */
    function borrow(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "vault: amount=0");
        require(lendingPool.collateralBalances(msg.sender, address(usyc)) > 0, "vault: no collateral");

        uint256 capacity = lendingPool.borrowCapacity(msg.sender);
        require(amount <= capacity, "vault: ltv exceeded");

        lendingPool.borrowFor(msg.sender, amount, msg.sender);
        emit Borrowed(msg.sender, amount);
    }

    /**
     * Manual repayment. User approves this vault for USDC first.
     */
    function repay(uint256 amount) external nonReentrant whenNotPaused returns (uint256 paid) {
        require(amount > 0, "vault: amount=0");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(address(lendingPool), amount);
        paid = lendingPool.repayFor(msg.sender, amount);

        emit Repaid(msg.sender, msg.sender, paid);
    }

    /**
     * Keeper path for the self-repaying mechanism.
     *
     * The keeper is responsible for sourcing/converting the harvested USYC
     * yield into USDC off-chain or through an approved venue. The keeper then
     * funds this call with USDC; the vault forwards it to LendingPool debt.
     */
    function harvestAndRepay(address user, uint256 usdcAmount)
        external
        nonReentrant
        whenNotPaused
        onlyKeeper
        returns (uint256 paid)
    {
        require(user != address(0), "vault: user=0");
        require(usdcAmount > 0, "vault: amount=0");
        require(lendingPool.debtOf(user) > 0, "vault: no debt");

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        usdc.forceApprove(address(lendingPool), usdcAmount);
        paid = lendingPool.repayFor(user, usdcAmount);

        emit HarvestRepaid(user, paid);
    }

    /**
     * Liquidation adapter. The liquidator funds the vault with USDC, the vault
     * liquidates through the pool, then forwards seized USYC to the liquidator.
     */
    function liquidate(address borrower, uint256 usdcAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 seized)
    {
        require(borrower != address(0), "vault: borrower=0");
        require(borrower != msg.sender, "vault: self-liquidation");
        require(usdcAmount > 0, "vault: amount=0");
        require(lendingPool.healthFactor(borrower) < WAD, "vault: position healthy");

        uint256 beforeBal = usyc.balanceOf(address(this));

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        usdc.forceApprove(address(lendingPool), usdcAmount);
        lendingPool.liquidate(borrower, address(usyc), usdcAmount);

        uint256 afterBal = usyc.balanceOf(address(this));
        seized = afterBal - beforeBal;
        require(seized > 0, "vault: no collateral seized");

        usyc.safeTransfer(msg.sender, seized);
        emit Liquidated(msg.sender, borrower, usdcAmount, seized);
    }

    function healthFactor(address user) external view returns (uint256) {
        return lendingPool.healthFactor(user);
    }

    function maxBorrow(address user) external view returns (uint256) {
        return lendingPool.borrowCapacity(user);
    }

    function collateralValueUSD(address user) external view returns (uint256) {
        // LendingPool exposes the oracle-backed collateral value through the
        // same state it uses for risk. This contract deliberately avoids a
        // second oracle calculation.
        uint256 amount = lendingPool.collateralBalances(user, address(usyc));
        if (amount == 0) return 0;

        // No local price calculation: return raw collateral amount for the UI
        // compatibility method. Use the pool's risk/borrow views for USD risk.
        return amount;
    }

    /**
     * Full position summary expected by the frontend.
     */
    function getPosition(address user)
        external
        view
        returns (uint256 collateral, uint256 debt, uint256 maxBorrowAmount, uint256 hf)
    {
        collateral = lendingPool.collateralBalances(user, address(usyc));
        debt = lendingPool.debtOf(user);
        maxBorrowAmount = lendingPool.borrowCapacity(user);
        hf = lendingPool.healthFactor(user);
    }
}
