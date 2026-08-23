// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/*
    CentryToken (CNTRY)
    ─────────────────────────────────────────────────────────────────────────
    Governance token for the Centry protocol.

    Locks in VeNFT             → voting power over gauges
    Held by LPs / borrowers    → received as protocol rewards
    Protocol treasury           → 20% initial mint

    Max supply: 100,000,000 CNTRY

    Mint authority:
        Owner sets one minter address (typically a RewardDistributor
        or LendingPool incentive contract). Owner can rotate it.
        Owner itself cannot mint after renouncing — avoids rug vector.

    Burn:
        VeNFT calls burn() when user locks tokens.
        Anyone can burn their own tokens.

    ERC20Permit:
        Gasless approvals via EIP-2612 signatures.
        Useful on Arc where USDC is gas — saves a tx for approvals.
*/

contract CentryToken is ERC20, ERC20Permit, Ownable2Step {

    /* ── Constants ───────────────────────────────────────────────────────── */

    uint256 public constant MAX_SUPPLY = 100_000_000e18; // 100M CNTRY

    // Initial treasury allocation: 20% of max supply
    uint256 public constant TREASURY_MINT = MAX_SUPPLY * 20 / 100;

    /* ── State ───────────────────────────────────────────────────────────── */

    /// @notice Address authorised to mint new tokens (e.g. incentive contract).
    ///         Only one minter at a time. Set to zero to freeze minting.
    address public minter;

    /* ── Events ──────────────────────────────────────────────────────────── */

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    /* ── Constructor ─────────────────────────────────────────────────────── */

    constructor(address initialOwner, address treasury)
        ERC20("Centry", "CNTRY")
        ERC20Permit("Centry")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "token: owner=0");
        require(treasury     != address(0), "token: treasury=0");

        // Mint 20% to treasury at deploy — team, liquidity bootstrap, etc.
        _mint(treasury, TREASURY_MINT);
    }

    /* ── Admin ───────────────────────────────────────────────────────────── */

    /**
     * @notice Set the address that can mint CNTRY.
     *         Typically your RewardDistributor or LendingPool contract.
     *         Pass address(0) to permanently freeze minting.
     */
    function setMinter(address minter_) external onlyOwner {
        emit MinterUpdated(minter, minter_);
        minter = minter_;
    }

    /* ── Mint ────────────────────────────────────────────────────────────── */

    /**
     * @notice Mint new CNTRY. Only callable by the authorised minter.
     * @param to     Recipient (cannot be zero address).
     * @param amount Amount to mint (WAD).
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "token: not minter");
        require(to         != address(0), "token: to=0");
        require(amount     > 0,           "token: amount=0");
        require(totalSupply() + amount <= MAX_SUPPLY, "token: max supply");

        _mint(to, amount);
    }

    /* ── Burn ────────────────────────────────────────────────────────────── */

    /**
     * @notice Burn caller's own tokens.
     *         VeNFT does NOT call this — it holds tokens in escrow.
     *         Burn is available for any user who wants to reduce supply.
     */
    function burn(uint256 amount) external {
        require(amount > 0, "token: amount=0");
        _burn(msg.sender, amount);
    }

    /**
     * @notice Burn from another address (requires allowance).
     *         VeNFT uses this to lock tokens into escrow on behalf of user.
     */
    function burnFrom(address account, uint256 amount) external {
        require(amount > 0, "token: amount=0");
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }

    /* ── View ────────────────────────────────────────────────────────────── */

    /// @notice Remaining mintable supply.
    function mintableSupply() external view returns (uint256) {
        uint256 supply = totalSupply();
        return supply >= MAX_SUPPLY ? 0 : MAX_SUPPLY - supply;
    }
}
