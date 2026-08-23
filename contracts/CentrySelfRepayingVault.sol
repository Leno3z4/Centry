// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./CentryOracle.sol";

/*
    CentrySelfRepayingVault
    ─────────────────────────────────────────────────────────────────────────
    Deposit USYC (Circle's yield-bearing stablecoin on Arc) as collateral.
    Borrow USDC against it.
    A keeper bot periodically harvests USYC yield, converts it to USDC
    off-chain, and calls harvestAndRepay() → your debt shrinks automatically.

    This is the core Neverland mechanic:
        USYC yield → auto-repays your USDC debt → loan self-repays over time.

    ─────────────────────────────────────────────────────────────────────────
    Design
    ─────────────────────────────────────────────────────────────────────────
    Self-contained: vault holds USYC (collateral) and USDC (loans).
    Protocol owner funds the vault with USDC via fundVault().
    Keeper address is separate from owner — least-privilege for automation.

    Health factor:
        HF = (collateralValueUSD × liquidationThreshold) / debtValueUSD
        HF >= 1e18 → safe
        HF <  1e18 → liquidatable

    ─────────────────────────────────────────────────────────────────────────
    FIXES vs Gemini + ChatGPT versions
    ─────────────────────────────────────────────────────────────────────────
    1. borrow() no longer tries to send USDC from an empty vault.
       Vault holds USDC funded by owner. Insufficient balance reverts cleanly.
    2. collateralValue() decimal math fixed (was returning wrong scale).
    3. healthFactor() actually computed (wasn't in ChatGPT merge).
    4. Keeper role separate from owner — onlyKeeper modifier.
    5. Liquidation added (was missing entirely in Gemini's vault).
    6. defundVault() guards against pulling USDC that covers outstanding loans.
    7. Pausable for emergency stop.
    8. Ownable2Step prevents ownership accidents.
*/

contract CentrySelfRepayingVault is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant WAD = 1e18;

    /* ── Immutables ──────────────────────────────────────────────────────── */

    IERC20  public immutable usyc;   // collateral token (yield-bearing)
    IERC20  public immutable usdc;   // borrow token
    address public immutable oracle; // ICentryOracle

    // LTV: max borrow / collateral value.  e.g. 0.75e18 = 75%
    uint256 public immutable ltv;

    // Liquidation threshold — must be > ltv.  e.g. 0.85e18 = 85%
    uint256 public immutable liquidationThreshold;

    // How much extra collateral liquidator receives.  e.g. 1.05e18 = +5%
    uint256 public immutable liquidationBonus;

    /* ── State ───────────────────────────────────────────────────────────── */

    struct Position {
        uint256 collateral; // USYC deposited (in USYC decimals)
        uint256 debt;       // USDC borrowed  (in USDC decimals = 6)
    }

    mapping(address => Position) public positions;

    uint256 public totalCollateral; // total USYC held
    uint256 public totalDebt;       // total USDC lent out

    // Address allowed to call harvestAndRepay — separate from owner
    address public keeper;

    /* ── Events ──────────────────────────────────────────────────────────── */

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, address indexed payer, uint256 amount);
    event HarvestRepaid(address indexed user, uint256 usdcAmount);
    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        uint256 usdcRepaid,
        uint256 usycSeized
    );
    event VaultFunded(address indexed from, uint256 amount);
    event VaultDefunded(address indexed to, uint256 amount);
    event KeeperUpdated(address newKeeper);

    /* ── Modifiers ───────────────────────────────────────────────────────── */

    modifier onlyKeeper() {
        require(
            msg.sender == keeper || msg.sender == owner(),
            "vault: not keeper"
        );
        _;
    }

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(
        address initialOwner,
        address usyc_,
        address usdc_,
        address oracle_,
        uint256 ltv_,
        uint256 liquidationThreshold_,
        uint256 liquidationBonus_
    )
        Ownable(initialOwner)
    {
        require(usyc_   != address(0), "vault: usyc=0");
        require(usdc_   != address(0), "vault: usdc=0");
        require(oracle_ != address(0), "vault: oracle=0");

        require(ltv_                  > 0,    "vault: ltv=0");
        require(ltv_                  < WAD,  "vault: ltv>=100%");
        require(liquidationThreshold_ > ltv_, "vault: threshold<=ltv");
        require(liquidationThreshold_ < WAD,  "vault: threshold>=100%");
        require(liquidationBonus_     >= WAD, "vault: bonus<1");
        require(liquidationBonus_     <= 1.20e18, "vault: bonus>20%");

        usyc                = IERC20(usyc_);
        usdc                = IERC20(usdc_);
        oracle              = oracle_;
        ltv                 = ltv_;
        liquidationThreshold = liquidationThreshold_;
        liquidationBonus    = liquidationBonus_;
    }

    /* ── Admin ───────────────────────────────────────────────────────────── */

    function setKeeper(address keeper_) external onlyOwner {
        require(keeper_ != address(0), "vault: keeper=0");
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    /**
     * @notice Add USDC liquidity so users can borrow.
     *         On testnet, protocol owner calls this manually.
     *         On mainnet, this would be funded by LendingPool revenue.
     */
    function fundVault(uint256 amount) external onlyOwner {
        require(amount > 0, "vault: amount=0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    /**
     * @notice Withdraw idle USDC from vault.
     *         Cannot pull USDC that is backing outstanding loans.
     */
    function defundVault(uint256 amount, address to) external onlyOwner {
        require(to     != address(0), "vault: to=0");
        require(amount >  0,          "vault: amount=0");

        uint256 idle = _idleUsdc();
        require(amount <= idle, "vault: would underfund loans");

        usdc.safeTransfer(to, amount);
        emit VaultDefunded(to, amount);
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /* ── Core: Collateral ────────────────────────────────────────────────── */

    /**
     * @notice Deposit USYC as collateral.
     *         This enables borrowing USDC against it.
     */
    function depositCollateral(uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "vault: amount=0");

        usyc.safeTransferFrom(msg.sender, address(this), amount);

        positions[msg.sender].collateral += amount;
        totalCollateral                  += amount;

        emit CollateralDeposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw collateral, provided health factor stays >= 1.
     *         Full withdrawal only if you have no debt.
     */
    function withdrawCollateral(uint256 amount)
        external
        nonReentrant
    {
        require(amount > 0, "vault: amount=0");

        Position storage p = positions[msg.sender];
        require(p.collateral >= amount, "vault: insufficient collateral");

        p.collateral    -= amount;
        totalCollateral -= amount;

        // Health check AFTER reducing collateral
        if (p.debt > 0) {
            require(
                healthFactor(msg.sender) >= WAD,
                "vault: would become unhealthy"
            );
        }

        usyc.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    /* ── Core: Borrow ────────────────────────────────────────────────────── */

    /**
     * @notice Borrow USDC against deposited USYC collateral.
     *
     * FIX: Gemini's version checked `usdc.balanceOf(lendingPool)` then
     *      tried to send from vault — vault had no USDC.
     *      This version checks vault's own balance and sends from itself.
     */
    function borrow(uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "vault: amount=0");

        Position storage p = positions[msg.sender];
        require(p.collateral > 0, "vault: no collateral");

        uint256 maxAllowed = maxBorrow(msg.sender);
        require(
            p.debt + amount <= maxAllowed,
            "vault: ltv exceeded"
        );

        // Check vault has enough USDC to lend
        // (idle = total USDC balance - already lent out)
        require(amount <= _idleUsdc(), "vault: insufficient liquidity");

        p.debt    += amount;
        totalDebt += amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
    }

    /* ── Core: Repay ─────────────────────────────────────────────────────── */

    /**
     * @notice Repay your USDC debt manually.
     *         Pass type(uint256).max to repay in full.
     */
    function repay(uint256 amount)
        external
        nonReentrant
    {
        _repay(msg.sender, msg.sender, amount);
    }

    /**
     * @notice Keeper-triggered repay using harvested USYC yield.
     *
     *  Flow:
     *    1. USYC sitting in vault appreciates (yield accrues on-chain).
     *    2. Keeper bot detects yield off-chain:
     *         yield = currentUSYCValue - initialDepositValue
     *    3. Keeper converts yield to USDC (via Circle API or DEX).
     *    4. Keeper calls harvestAndRepay(user, usdcYieldAmount).
     *    5. USDC reduces user's debt → loan self-repays.
     *
     *  This is the self-repaying mechanic — interest is paid by the
     *  asset's own yield rather than the user's wallet.
     */
    function harvestAndRepay(address user, uint256 usdcAmount)
        external
        nonReentrant
        onlyKeeper
    {
        require(user      != address(0), "vault: user=0");
        require(usdcAmount > 0,          "vault: amount=0");

        Position storage p = positions[user];
        require(p.debt > 0, "vault: no debt");

        // Cap at outstanding debt — no over-repay
        if (usdcAmount > p.debt) usdcAmount = p.debt;

        // Keeper sends the USDC in
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        p.debt    -= usdcAmount;
        totalDebt -= usdcAmount;

        emit HarvestRepaid(user, usdcAmount);
    }

    /* ── Liquidation ─────────────────────────────────────────────────────── */

    /**
     * @notice Liquidate an undercollateralised position.
     *         Liquidator repays USDC debt, receives USYC + bonus.
     *
     *         Per-call cap: 50% of debt (standard DeFi convention).
     *         If collateral can't cover full bonus, liquidator receives
     *         all remaining collateral at no extra discount.
     */
    function liquidate(address borrower, uint256 usdcAmount)
        external
        nonReentrant
    {
        require(borrower    != msg.sender, "vault: self-liquidation");
        require(usdcAmount  > 0,           "vault: amount=0");
        require(
            healthFactor(borrower) < WAD,
            "vault: position healthy"
        );

        Position storage p = positions[borrower];
        require(p.debt > 0, "vault: no debt");

        // Cap at 50% of debt per call
        uint256 maxRepay = p.debt / 2;
        if (usdcAmount > maxRepay) usdcAmount = maxRepay;

        // Calculate USYC to seize (debt value + liquidation bonus)
        uint256 debtValueUSD      = _toUSDValue(address(usdc), usdcAmount);
        uint256 collateralWithBonus = debtValueUSD * liquidationBonus / WAD;
        uint256 usycToSeize         = _fromUSDValue(address(usyc), collateralWithBonus);

        // Cap at available collateral (can't take more than borrower has)
        if (usycToSeize > p.collateral) usycToSeize = p.collateral;
        require(usycToSeize > 0, "vault: no collateral to seize");

        // Update state
        p.debt          -= usdcAmount;
        p.collateral    -= usycToSeize;
        totalDebt       -= usdcAmount;
        totalCollateral -= usycToSeize;

        // Liquidator pays USDC, receives USYC
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        usyc.safeTransfer(msg.sender, usycToSeize);

        emit Liquidated(msg.sender, borrower, usdcAmount, usycToSeize);
    }

    /* ── View ────────────────────────────────────────────────────────────── */

    /**
     * @notice Health factor for a user.
     *         >= 1e18 = healthy. < 1e18 = liquidatable. max = no debt.
     */
    function healthFactor(address user) public view returns (uint256) {
        uint256 debtUSD = _toUSDValue(address(usdc), positions[user].debt);
        if (debtUSD == 0) return type(uint256).max;

        // Weighted by liquidationThreshold (not ltv — threshold is the danger line)
        uint256 colUSD =
            _toUSDValue(address(usyc), positions[user].collateral)
            * liquidationThreshold / WAD;

        return colUSD * WAD / debtUSD;
    }

    /// @notice Max USDC this user can borrow given their collateral and existing debt.
    function maxBorrow(address user) public view returns (uint256) {
        uint256 colValueUSD = _toUSDValue(address(usyc), positions[user].collateral);
        uint256 maxDebtUSD  = colValueUSD * ltv / WAD;
        uint256 curDebtUSD  = _toUSDValue(address(usdc), positions[user].debt);

        if (maxDebtUSD <= curDebtUSD) return 0;

        // Convert remaining USD headroom back to USDC amount
        return _fromUSDValue(address(usdc), maxDebtUSD - curDebtUSD);
    }

    /// @notice USD value of a user's collateral (18 decimals).
    function collateralValueUSD(address user) external view returns (uint256) {
        return _toUSDValue(address(usyc), positions[user].collateral);
    }

    /// @notice Full position summary for the frontend.
    function getPosition(address user)
        external
        view
        returns (
            uint256 collateral,
            uint256 debt,
            uint256 maxBorrowAmount,
            uint256 hf
        )
    {
        return (
            positions[user].collateral,
            positions[user].debt,
            maxBorrow(user),
            healthFactor(user)
        );
    }

    /// @notice USDC in vault not currently lent out.
    function idleLiquidity() external view returns (uint256) {
        return _idleUsdc();
    }

    /* ── Internal: USD math ──────────────────────────────────────────────── */

    /**
     * @dev Convert `amount` of `asset` to USD value (WAD, 18 decimals).
     *
     *      FIX: Gemini's collateralValue had:
     *           amount * price * 1e18 / (10**decimals) / 10**18
     *           The *1e18 and /10**18 cancel out, returning the raw scaled value.
     *
     *      Correct formula:
     *           USD_value = amount / (10^assetDec) * price / (10^priceDec)
     *           Normalised to WAD:
     *           USD_value_WAD = amount * price * WAD / (10^assetDec) / (10^priceDec)
     */
    function _toUSDValue(address asset, uint256 amount)
        internal
        view
        returns (uint256)
    {
        if (amount == 0) return 0;

        (uint256 price, uint8 priceDec) = ICentryOracle(oracle).getPrice(asset);
        uint8 assetDec = _decimals(asset);

        // amount * price * WAD / 10^assetDec / 10^priceDec
        // Use intermediate WAD to avoid precision loss on small amounts
        return amount * price * WAD
            / (10 ** uint256(assetDec))
            / (10 ** uint256(priceDec));
    }

    /// @dev Convert a USD value (WAD) back to asset token amount.
    function _fromUSDValue(address asset, uint256 usdValueWAD)
        internal
        view
        returns (uint256)
    {
        if (usdValueWAD == 0) return 0;

        (uint256 price, uint8 priceDec) = ICentryOracle(oracle).getPrice(asset);
        uint8 assetDec = _decimals(asset);

        return usdValueWAD
            * (10 ** uint256(priceDec))
            * (10 ** uint256(assetDec))
            / price
            / WAD;
    }

    function _idleUsdc() internal view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        // totalDebt is USDC lent out — can't count it as available
        return bal > totalDebt ? bal - totalDebt : 0;
    }

    function _decimals(address asset) internal view returns (uint8) {
        try IERC20Metadata(asset).decimals() returns (uint8 d) { return d; }
        catch { return 18; }
    }

    /* ── Internal: repay ─────────────────────────────────────────────────── */

    function _repay(address borrower, address payer, uint256 amount) internal {
        Position storage p = positions[borrower];
        require(p.debt > 0, "vault: no debt");

        if (amount == type(uint256).max || amount > p.debt) {
            amount = p.debt;
        }

        usdc.safeTransferFrom(payer, address(this), amount);

        p.debt    -= amount;
        totalDebt -= amount;

        emit Repaid(borrower, payer, amount);
    }
}
