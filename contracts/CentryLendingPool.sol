// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./CentryOracle.sol";
import "./CentryInterestRateModel.sol";

/*
    CentryLendingPool
    ─────────────────────────────────────────────────────────────────────────
    USDC-only lending pool.

    Suppliers:
        supply(amount)      → deposit USDC, receive shares that grow with interest
        withdraw(shares)    → burn shares, receive USDC + accrued interest

    Borrowers:
        supplyCollateral(asset, amount)   → lock approved collateral
        withdrawCollateral(asset, amount) → retrieve collateral (if HF stays healthy)
        borrow(amount)                    → take USDC against collateral
        repay(onBehalfOf, amount)         → repay any user's debt

    Protocol:
        liquidate(borrower, collateral, debtAmount) → repay undercollateralised debt
        withdrawReserves(amount, to)                → pull protocol fees

    The SelfRepayingVault is an authorised vault that can call
    borrowFor() / repayFor() on behalf of its users.  No other
    address may do so.

    ─────────────────────────────────────────────────────────────────────────
    FIXES vs Gemini version
    ─────────────────────────────────────────────────────────────────────────
    1. healthFactor() actually calculates collateral + debt values.
    2. accrueInterest() no longer transfers mid-computation (was double-counting).
       Reserves accumulate in protocolReserves; owner withdraws explicitly.
    3. Borrow index uses WAD (not RAY) — consistent with IRM output.
    4. collateralValue math fixed: correct decimal normalisation.
    5. Max 8 collateral assets per user prevents gas-DoS on HF loop.
    6. Ownable2Step prevents accidental ownership loss.
    7. Full liquidation path with proper bonus cap.
    8. borrowFor / repayFor restricted to authorised vault only.
*/

contract CentryLendingPool is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant WAD                  = 1e18;
    uint256 public constant MAX_COLLATERAL_ASSETS = 8;    // gas-DoS guard
    uint256 public constant MAX_RESERVE_FACTOR   = 0.30e18; // 30% hard cap

    /* ── Immutables ──────────────────────────────────────────────────────── */

    IERC20 public immutable usdc;

    /* ── Collateral config ───────────────────────────────────────────────── */

    struct CollateralConfig {
        bool     active;
        uint256  ltv;                  // max borrow / collateral value (WAD)
        uint256  liquidationThreshold; // HF trigger (WAD, must be > ltv)
        uint256  liquidationBonus;     // extra collateral liquidator receives (WAD, e.g. 1.05e18)
    }

    mapping(address => CollateralConfig) public collateralConfigs;

    // user → collateral asset → balance
    mapping(address => mapping(address => uint256)) public collateralBalances;

    // track which collateral assets each user has (for HF loop)
    mapping(address => address[])                private _userCollateralList;
    mapping(address => mapping(address => bool)) private _inCollateralList;

    /* ── USDC supply pool (share-based) ─────────────────────────────────── */

    uint256 public totalSupplyAssets;  // total USDC the pool "owns" (grows with interest)
    uint256 public totalSupplyShares;  // total shares issued to suppliers

    mapping(address => uint256) public supplyShares;

    /* ── Borrow accounting ───────────────────────────────────────────────── */

    uint256 public totalBorrows;       // total USDC currently borrowed
    uint256 public borrowIndex;        // WAD, starts at 1e18, grows with interest
    uint256 public lastAccrual;        // timestamp of last accrueInterest call

    // user borrow shares — current debt = borrowShares[user] * borrowIndex / WAD
    mapping(address => uint256) public borrowShares;
    uint256 public totalBorrowShares;

    /* ── Protocol reserves ───────────────────────────────────────────────── */

    uint256 public protocolReserves;   // USDC owed to protocol, not yet withdrawn
    uint256 public reserveFactor;      // WAD, e.g. 0.10e18 = 10%

    /* ── External contracts ──────────────────────────────────────────────── */

    address public oracle;
    address public interestRateModel;
    address public authorisedVault;    // only address allowed to call borrowFor/repayFor

    /* ── Events ──────────────────────────────────────────────────────────── */

    event CollateralConfigured(
        address indexed asset,
        uint256 ltv,
        uint256 liquidationThreshold,
        uint256 liquidationBonus
    );
    event CollateralDisabled(address indexed asset);

    event Supplied(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 amount, uint256 shares);

    event CollateralSupplied(address indexed user, address indexed asset, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed asset, uint256 amount);

    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed borrower, address indexed payer, uint256 amount);

    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        address indexed collateral,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    event ReservesWithdrawn(address indexed to, uint256 amount);
    event OracleUpdated(address newOracle);
    event IrmUpdated(address newIrm);
    event ReserveFactorUpdated(uint256 newFactor);
    event AuthorisedVaultUpdated(address vault);

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(
        address initialOwner,
        address usdc_,
        address oracle_,
        address interestRateModel_,
        uint256 reserveFactor_
    )
        Ownable(initialOwner)
    {
        require(usdc_              != address(0), "pool: usdc=0");
        require(oracle_            != address(0), "pool: oracle=0");
        require(interestRateModel_ != address(0), "pool: irm=0");
        require(reserveFactor_     <= MAX_RESERVE_FACTOR, "pool: reserve too high");

        usdc              = IERC20(usdc_);
        oracle            = oracle_;
        interestRateModel = interestRateModel_;
        reserveFactor     = reserveFactor_;
        borrowIndex       = WAD;
        lastAccrual       = block.timestamp;
    }

    /* ── Admin ───────────────────────────────────────────────────────────── */

    function configureCollateral(
        address asset,
        uint256 ltv_,
        uint256 liquidationThreshold_,
        uint256 liquidationBonus_
    )
        external
        onlyOwner
    {
        require(asset                 != address(0),  "pool: asset=0");
        require(ltv_                   < WAD,          "pool: ltv >= 100%");
        require(liquidationThreshold_  > ltv_,         "pool: threshold <= ltv");
        require(liquidationThreshold_  < WAD,          "pool: threshold >= 100%");
        require(liquidationBonus_      >= WAD,         "pool: bonus < 1");
        require(liquidationBonus_      <= 1.20e18,     "pool: bonus > 20%");

        collateralConfigs[asset] = CollateralConfig({
            active:               true,
            ltv:                  ltv_,
            liquidationThreshold: liquidationThreshold_,
            liquidationBonus:     liquidationBonus_
        });

        emit CollateralConfigured(asset, ltv_, liquidationThreshold_, liquidationBonus_);
    }

    function disableCollateral(address asset) external onlyOwner {
        collateralConfigs[asset].active = false;
        emit CollateralDisabled(asset);
    }

    function setOracle(address oracle_) external onlyOwner {
        require(oracle_ != address(0), "pool: oracle=0");
        oracle = oracle_;
        emit OracleUpdated(oracle_);
    }

    function setInterestRateModel(address irm_) external onlyOwner {
        require(irm_ != address(0), "pool: irm=0");
        interestRateModel = irm_;
        emit IrmUpdated(irm_);
    }

    function setReserveFactor(uint256 factor) external onlyOwner {
        require(factor <= MAX_RESERVE_FACTOR, "pool: reserve too high");
        accrueInterest(); // settle at old rate first
        reserveFactor = factor;
        emit ReserveFactorUpdated(factor);
    }

    function setAuthorisedVault(address vault) external onlyOwner {
        authorisedVault = vault;
        emit AuthorisedVaultUpdated(vault);
    }

    /// @notice Owner pulls accumulated protocol fees.
    function withdrawReserves(uint256 amount, address to) external onlyOwner {
        require(to     != address(0), "pool: to=0");
        require(amount <= protocolReserves, "pool: amount > reserves");

        protocolReserves -= amount;
        usdc.safeTransfer(to, amount);

        emit ReservesWithdrawn(to, amount);
    }

    /* ── Interest accrual ────────────────────────────────────────────────── */

    /**
     * @notice Accumulate interest since last call.
     *
     * Does NOT transfer tokens — reserves stay in the contract and are
     * tracked via `protocolReserves`. Owner withdraws them explicitly.
     * This avoids the double-counting bug in Gemini's version.
     */
    function accrueInterest() public {
        uint256 elapsed = block.timestamp - lastAccrual;
        if (elapsed == 0) return;

        lastAccrual = block.timestamp;

        if (totalBorrows == 0) return;

        uint256 cash = _cash();

        uint256 ratePerSecond =
            CentryInterestRateModel(interestRateModel)
                .borrowRatePerSecond(cash, totalBorrows);

        // interestFactor: how much the index grew (WAD)
        uint256 interestFactor = ratePerSecond * elapsed;

        uint256 interest = totalBorrows * interestFactor / WAD;
        if (interest == 0) return;

        // Protocol takes reserveFactor share — tracked, not transferred
        uint256 reserveShare  = interest * reserveFactor / WAD;
        uint256 supplierShare = interest - reserveShare;

        totalBorrows      += interest;
        borrowIndex       += borrowIndex * interestFactor / WAD;
        protocolReserves  += reserveShare;
        totalSupplyAssets += supplierShare; // each share now worth more USDC
    }

    /* ── Supply (USDC → earn yield) ──────────────────────────────────────── */

    /**
     * @notice Deposit USDC into the pool. Returns shares.
     *         Interest accrues by totalSupplyAssets growing — you don't
     *         need to claim; just withdraw later for more than you put in.
     */
    function supply(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(amount > 0, "pool: amount=0");

        accrueInterest();

        shares = _toSupplyShares(amount);

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        supplyShares[msg.sender] += shares;
        totalSupplyShares        += shares;
        totalSupplyAssets        += amount;

        emit Supplied(msg.sender, amount, shares);
    }

    /**
     * @notice Withdraw USDC by burning shares.
     * @param shares  Pass type(uint256).max to withdraw everything.
     */
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        require(shares > 0, "pool: shares=0");

        accrueInterest();

        if (shares == type(uint256).max) {
            shares = supplyShares[msg.sender];
        }

        require(supplyShares[msg.sender] >= shares, "pool: insufficient shares");

        amount = _fromSupplyShares(shares);

        require(amount <= _cash(), "pool: insufficient liquidity");

        supplyShares[msg.sender] -= shares;
        totalSupplyShares        -= shares;
        totalSupplyAssets        -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, shares);
    }

    /* ── Collateral ──────────────────────────────────────────────────────── */

    /**
     * @notice Lock a collateral asset.
     *         `onBehalfOf` lets the SelfRepayingVault deposit on user's behalf.
     */
    function supplyCollateral(
        address asset,
        uint256 amount,
        address onBehalfOf
    )
        external
        nonReentrant
    {
        require(amount                          > 0,     "pool: amount=0");
        require(collateralConfigs[asset].active,          "pool: unsupported collateral");
        require(onBehalfOf                     != address(0), "pool: onBehalfOf=0");

        // Enforce max distinct collateral assets per user
        if (!_inCollateralList[onBehalfOf][asset]) {
            require(
                _userCollateralList[onBehalfOf].length < MAX_COLLATERAL_ASSETS,
                "pool: too many collateral assets"
            );
            _userCollateralList[onBehalfOf].push(asset);
            _inCollateralList[onBehalfOf][asset] = true;
        }

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        collateralBalances[onBehalfOf][asset] += amount;

        emit CollateralSupplied(onBehalfOf, asset, amount);
    }

    /**
     * @notice Retrieve unlocked collateral.  Reverts if HF would drop below 1.
     */
    function withdrawCollateral(
        address asset,
        uint256 amount
    )
        external
        nonReentrant
    {
        require(amount > 0, "pool: amount=0");
        require(collateralBalances[msg.sender][asset] >= amount, "pool: insufficient collateral");

        collateralBalances[msg.sender][asset] -= amount;

        // Health check AFTER reducing collateral
        require(healthFactor(msg.sender) >= WAD, "pool: would become unhealthy");

        IERC20(asset).safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, asset, amount);
    }

    /* ── Borrow ──────────────────────────────────────────────────────────── */

    function borrow(uint256 amount) external nonReentrant {
        _borrow(msg.sender, amount, msg.sender);
    }

    /// @notice Only authorised vault may call this.
    function borrowFor(
        address onBehalfOf,
        uint256 amount,
        address recipient
    )
        external
        nonReentrant
    {
        require(msg.sender == authorisedVault, "pool: not vault");
        require(recipient  != address(0),      "pool: recipient=0");
        _borrow(onBehalfOf, amount, recipient);
    }

    function _borrow(
        address borrower,
        uint256 amount,
        address recipient
    )
        internal
    {
        require(amount > 0, "pool: amount=0");

        accrueInterest();

        require(amount <= _cash(), "pool: insufficient liquidity");

        uint256 shares = _toBorrowShares(amount);

        borrowShares[borrower] += shares;
        totalBorrowShares      += shares;
        totalBorrows           += amount;

        // Health check AFTER updating debt
        require(healthFactor(borrower) >= WAD, "pool: insufficient collateral");

        usdc.safeTransfer(recipient, amount);

        emit Borrowed(borrower, amount);
    }

    /* ── Repay ───────────────────────────────────────────────────────────── */

    /**
     * @notice Repay debt. Anyone can repay on behalf of a borrower.
     * @param onBehalfOf  Whose debt to reduce.
     * @param amount      Pass type(uint256).max to repay full debt.
     */
    function repay(
        address onBehalfOf,
        uint256 amount
    )
        external
        nonReentrant
        returns (uint256 paid)
    {
        require(onBehalfOf != address(0), "pool: onBehalfOf=0");

        accrueInterest();

        uint256 currentDebt = _currentDebt(onBehalfOf);
        require(currentDebt > 0, "pool: no debt");

        if (amount == type(uint256).max || amount > currentDebt) {
            amount = currentDebt;
        }

        uint256 shares = _debtToShares(amount);
        // Guard against rounding leaving 1-wei dust
        if (shares > borrowShares[onBehalfOf]) {
            shares = borrowShares[onBehalfOf];
        }

        // Recalculate amount from shares to stay consistent
        uint256 actualAmount = _sharesToDebt(shares);

        borrowShares[onBehalfOf] -= shares;
        totalBorrowShares        -= shares;
        totalBorrows             -= actualAmount;

        usdc.safeTransferFrom(msg.sender, address(this), actualAmount);

        emit Repaid(onBehalfOf, msg.sender, actualAmount);
        return actualAmount;
    }

    /// @notice Vault-only repay path (keeper sends USDC directly).
    function repayFor(
        address onBehalfOf,
        uint256 amount
    )
        external
        nonReentrant
        returns (uint256)
    {
        require(msg.sender == authorisedVault, "pool: not vault");
        // Identical logic to repay() — duplicated to keep auth clear
        accrueInterest();

        uint256 currentDebt = _currentDebt(onBehalfOf);
        if (currentDebt == 0) return 0;
        if (amount > currentDebt) amount = currentDebt;

        uint256 shares = _debtToShares(amount);
        if (shares > borrowShares[onBehalfOf]) shares = borrowShares[onBehalfOf];

        uint256 actualAmount = _sharesToDebt(shares);

        borrowShares[onBehalfOf] -= shares;
        totalBorrowShares        -= shares;
        totalBorrows             -= actualAmount;

        usdc.safeTransferFrom(msg.sender, address(this), actualAmount);

        emit Repaid(onBehalfOf, msg.sender, actualAmount);
        return actualAmount;
    }

    /* ── Liquidation ─────────────────────────────────────────────────────── */

    /**
     * @notice Repay a borrower's debt and seize their collateral at a bonus.
     *
     * Conditions:
     *   - borrower's healthFactor < 1e18
     *   - debtAmount ≤ 50% of borrower's current debt (per-call cap)
     *
     * Liquidator:
     *   - sends `debtAmount` USDC
     *   - receives `debtAmount` worth of collateral + liquidationBonus
     */
    function liquidate(
        address borrower,
        address collateralAsset,
        uint256 debtAmount
    )
        external
        nonReentrant
    {
        require(borrower != msg.sender, "pool: self-liquidation");

        accrueInterest();

        require(healthFactor(borrower) < WAD, "pool: position healthy");

        uint256 currentDebt = _currentDebt(borrower);
        require(currentDebt > 0, "pool: no debt");

        // Cap at 50% of debt per liquidation call (standard DeFi convention)
        uint256 maxRepay = currentDebt / 2;
        if (debtAmount > maxRepay) debtAmount = maxRepay;
        require(debtAmount > 0, "pool: debtAmount=0");

        CollateralConfig memory cfg = collateralConfigs[collateralAsset];
        require(cfg.active, "pool: collateral not active");

        // How much collateral is this debt worth, plus bonus
        uint256 debtValueUSD      = _toUSDValue(address(usdc), debtAmount);
        uint256 collateralWithBonus = debtValueUSD * cfg.liquidationBonus / WAD;
        uint256 collateralToSeize   = _fromUSDValue(collateralAsset, collateralWithBonus);

        // Cap seizure at borrower's actual collateral (can't take what they don't have)
        uint256 available = collateralBalances[borrower][collateralAsset];
        if (collateralToSeize > available) {
            collateralToSeize = available;
        }

        require(collateralToSeize > 0, "pool: no collateral to seize");

        // Update state
        uint256 shares = _debtToShares(debtAmount);
        if (shares > borrowShares[borrower]) shares = borrowShares[borrower];

        uint256 actualDebt = _sharesToDebt(shares);

        borrowShares[borrower]                   -= shares;
        totalBorrowShares                        -= shares;
        totalBorrows                             -= actualDebt;
        collateralBalances[borrower][collateralAsset] -= collateralToSeize;

        // Liquidator pays USDC, receives collateral
        usdc.safeTransferFrom(msg.sender, address(this), actualDebt);
        IERC20(collateralAsset).safeTransfer(msg.sender, collateralToSeize);

        emit Liquidated(
            msg.sender,
            borrower,
            collateralAsset,
            actualDebt,
            collateralToSeize
        );
    }

    /* ── Health factor (THE critical fix) ───────────────────────────────── */

    /**
     * @notice Returns health factor in WAD.
     *         >= 1e18 → healthy.  < 1e18 → liquidatable.
     *         type(uint256).max → no debt (infinitely healthy).
     *
     * HF = (Σ collateralValueUSD × liquidationThreshold) / totalDebtUSD
     *
     * FIX: Gemini's version declared collateralValue and debtValue
     *      but never populated them.  This version actually loops.
     */
    function healthFactor(address user) public view returns (uint256) {
        uint256 debtUSD = _currentDebtUSD(user);
        if (debtUSD == 0) return type(uint256).max;

        uint256 weightedCollateralUSD = _weightedCollateralUSD(user);

        return weightedCollateralUSD * WAD / debtUSD;
    }

    /* ── View helpers ────────────────────────────────────────────────────── */

    /// @notice Current USDC balance this pool can lend out.
    function availableLiquidity() external view returns (uint256) {
        return _cash();
    }

    /// @notice Current USDC value of a user's supply shares.
    function supplyBalance(address user) external view returns (uint256) {
        return _fromSupplyShares(supplyShares[user]);
    }

    /// @notice Current debt including accrued interest not yet checkpointed.
    function debtOf(address user) external view returns (uint256) {
        return _currentDebt(user);
    }

    /// @notice How much more USDC `user` can borrow right now.
    function borrowCapacity(address user) external view returns (uint256) {
        uint256 totalColUSD  = _totalCollateralUSD(user);
        uint256 currentDebt  = _currentDebtUSD(user);

        uint256 maxDebt = 0;
        address[] memory assets = _userCollateralList[user];
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 bal   = collateralBalances[user][asset];
            if (bal == 0) continue;

            (uint256 price, uint8 dec) = ICentryOracle(oracle).getPrice(asset);
            uint256 assetUSD = _normalise(bal, _decimals(asset), price, dec);
            maxDebt += assetUSD * collateralConfigs[asset].ltv / WAD;
        }

        // Suppress unused variable warning for totalColUSD
        totalColUSD;

        if (maxDebt <= currentDebt) return 0;
        return maxDebt - currentDebt;
    }

    /// @notice Pool summary for the frontend.
    function getReserveData()
        external
        view
        returns (
            uint256 totalLiquidity,
            uint256 totalBorrowsOut,
            uint256 borrowRatePerYear,
            uint256 supplyRatePerYear
        )
    {
        uint256 cash = _cash();
        CentryInterestRateModel irm = CentryInterestRateModel(interestRateModel);

        uint256 bRatePerSec = irm.borrowRatePerSecond(cash, totalBorrows);
        uint256 sRatePerSec = irm.supplyRatePerSecond(cash, totalBorrows, reserveFactor);

        return (
            totalSupplyAssets,
            totalBorrows,
            bRatePerSec * 365 days,
            sRatePerSec * 365 days
        );
    }

    /// @notice Collateral list for a user (for UI display).
    function userCollaterals(address user)
        external
        view
        returns (address[] memory)
    {
        return _userCollateralList[user];
    }

    /* ── Internal: share math ────────────────────────────────────────────── */

    function _toSupplyShares(uint256 assets) internal view returns (uint256) {
        if (totalSupplyAssets == 0 || totalSupplyShares == 0) return assets;
        return assets * totalSupplyShares / totalSupplyAssets;
    }

    function _fromSupplyShares(uint256 shares) internal view returns (uint256) {
        if (totalSupplyShares == 0) return 0;
        return shares * totalSupplyAssets / totalSupplyShares;
    }

    function _toBorrowShares(uint256 assets) internal view returns (uint256) {
        if (totalBorrows == 0 || totalBorrowShares == 0) return assets;
        return assets * totalBorrowShares / totalBorrows;
    }

    function _debtToShares(uint256 debt) internal view returns (uint256) {
        if (totalBorrows == 0 || totalBorrowShares == 0) return debt;
        return debt * totalBorrowShares / totalBorrows;
    }

    function _sharesToDebt(uint256 shares) internal view returns (uint256) {
        if (totalBorrowShares == 0) return 0;
        return shares * totalBorrows / totalBorrowShares;
    }

    function _currentDebt(address user) internal view returns (uint256) {
        return _sharesToDebt(borrowShares[user]);
    }

    /* ── Internal: USD valuation ─────────────────────────────────────────── */

    /// @dev Normalise `amount` of `asset` (with `assetDec` decimals) to 1e18 USD.
    function _normalise(
        uint256 amount,
        uint8   assetDec,
        uint256 price,
        uint8   priceDec
    )
        internal
        pure
        returns (uint256)
    {
        // result = amount * price * 1e18 / (10^assetDec) / (10^priceDec)
        // Done in two steps to avoid overflow on large amounts
        return amount * price / (10 ** priceDec) * WAD / (10 ** assetDec);
    }

    function _toUSDValue(address asset, uint256 amount) internal view returns (uint256) {
        (uint256 price, uint8 priceDec) = ICentryOracle(oracle).getPrice(asset);
        return _normalise(amount, _decimals(asset), price, priceDec);
    }

    function _fromUSDValue(address asset, uint256 usdValue) internal view returns (uint256) {
        (uint256 price, uint8 priceDec) = ICentryOracle(oracle).getPrice(asset);
        uint8 assetDec = _decimals(asset);
        // Reverse of _normalise
        return usdValue * (10 ** priceDec) / price * (10 ** assetDec) / WAD;
    }

    function _currentDebtUSD(address user) internal view returns (uint256) {
        uint256 debt = _currentDebt(user);
        if (debt == 0) return 0;
        return _toUSDValue(address(usdc), debt);
    }

    /// @dev Sum of collateral values weighted by liquidationThreshold — used in HF.
    function _weightedCollateralUSD(address user) internal view returns (uint256 total) {
        address[] memory assets = _userCollateralList[user];
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 bal   = collateralBalances[user][asset];
            if (bal == 0) continue;

            uint256 valueUSD  = _toUSDValue(asset, bal);
            uint256 threshold = collateralConfigs[asset].liquidationThreshold;
            total += valueUSD * threshold / WAD;
        }
    }

    /// @dev Raw collateral USD (no threshold weighting) — used in borrowCapacity.
    function _totalCollateralUSD(address user) internal view returns (uint256 total) {
        address[] memory assets = _userCollateralList[user];
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 bal   = collateralBalances[user][asset];
            if (bal == 0) continue;
            total += _toUSDValue(asset, bal);
        }
    }

    function _cash() internal view returns (uint256) {
        return usdc.balanceOf(address(this)) - protocolReserves;
    }

    function _decimals(address asset) internal view returns (uint8) {
        try IERC20Metadata(asset).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }
}
