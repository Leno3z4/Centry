// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICentryAgentFactoryRegistry {
    function isCentryAgentAccount(address account) external view returns (bool);
}
import "./interfaces/ICentryERC8004IdentityRegistry.sol";

/// @title Centry Onchain Agent Account
/// @notice A user-owned smart account that can delegate narrowly-scoped execution to onchain agents.
/// @dev This is the first account layer for Centry's onchain-agent system. It deliberately keeps
///      protocol-specific policy out of the account so the same account can interact with Centry,
///      Arc-native applications, or other approved EVM contracts.
contract CentryOnchainAgentAccount is ERC721Holder, ERC1155Holder, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_BATCH_CALLS = 32;

    struct Permission {
        bool allowed;
        uint64 expiresAt;
        uint128 maxNativeValue;
    }

    struct FinancialLimit {
        uint128 maxAmountPerCall;
        uint128 maxAmountPerWindow;
        uint128 spentInWindow;
        uint64 windowStart;
        uint64 windowDuration;
    }

    uint256 public constant FINANCIAL_LIMIT_VERSION = 1;
    uint64 public constant MIN_FINANCIAL_WINDOW = 1 hours;
    uint64 public constant MAX_FINANCIAL_WINDOW = 30 days;

    bytes4 private constant APPROVE_SELECTOR = 0x095ea7b3;
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;
    bytes4 private constant TRANSFER_FROM_SELECTOR = 0x23b872dd;
    bytes4 private constant SUPPLY_SELECTOR = bytes4(keccak256("supply(address,uint256)"));
    bytes4 private constant WITHDRAW_SELECTOR = bytes4(keccak256("withdraw(address,uint256)"));
    bytes4 private constant BORROW_SELECTOR = bytes4(keccak256("borrow(address,uint256)"));
    bytes4 private constant REPAY_SELECTOR = bytes4(keccak256("repay(address,uint256)"));
    bytes4 private constant SWAP_EXACT_INPUT_SINGLE_SELECTOR = bytes4(
        keccak256("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))")
    );
    bytes4 private constant TRANSFER_TO_AGENT_SELECTOR = bytes4(
        keccak256("transferToAgent(address,address,uint256)")
    );

    address public owner;
    address public pendingOwner;
    address public immutable factory;
    bool public initialized;
    bool public active;

    bytes32 public templateId;
    bytes32 public configHash;
    string public metadataURI;

    address public erc8004IdentityRegistry;
    uint256 public erc8004AgentId;

    mapping(address => bool) public agentOperators;
    mapping(address => mapping(address => mapping(bytes4 => Permission))) public permissions;
    mapping(address => mapping(address => mapping(bytes4 => mapping(address => FinancialLimit)))) public financialLimits;
    mapping(address => mapping(address => mapping(address => bool))) public approvalSpenders;

    error AlreadyInitialized();
    error InvalidOwner();
    error NotOwner();
    error NotPendingOwner();
    error NotFactory();
    error NotAgent();
    error AgentNotPermitted();
    error PermissionExpired();
    error NativeValueTooHigh();
    error BatchTooLarge();
    error CallFailed();
    error InvalidIdentityRegistry();
    error IdentityAlreadyRegistered();
    error IdentityNotRegistered();
    error InvalidWithdrawalToken();
    error WithdrawalFailed();
    error InvalidAgentRecipient();
    error InvalidFinancialLimit();
    error FinancialLimitNotConfigured();
    error FinancialLimitExceeded();
    error InvalidFinancialCall();
    error ApprovalSpenderNotAllowed();
    error FinancialRecipientNotAllowed();

    event Initialized(
        address indexed owner,
        address indexed factory,
        address indexed initialOperator,
        bytes32 templateId,
        bytes32 configHash
    );
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AgentOperatorSet(address indexed operator, bool active);
    event AgentActivationSet(bool active);
    event PermissionSet(
        address indexed operator,
        address indexed target,
        bytes4 indexed selector,
        bool allowed,
        uint64 expiresAt,
        uint128 maxNativeValue
    );
    event FinancialLimitSet(
        address indexed operator,
        address indexed target,
        bytes4 indexed selector,
        address asset,
        uint128 maxAmountPerCall,
        uint128 maxAmountPerWindow,
        uint64 windowDuration
    );
    event ApprovalSpenderSet(
        address indexed operator,
        address indexed asset,
        address indexed spender,
        bool allowed
    );
    event AgentExecuted(
        address indexed operator,
        address indexed target,
        uint256 value,
        bytes4 indexed selector,
        bytes32 dataHash
    );
    event AgentBatchExecuted(address indexed operator, uint256 callCount);
    event AgentMetadataUpdated(bytes32 indexed configHash, string metadataURI);
    event ERC8004IdentityRegistered(
        address indexed identityRegistry,
        uint256 indexed agentId,
        string agentURI
    );
    event ERC8004IdentityURIUpdated(uint256 indexed agentId, string agentURI);
    event AgentWithdrawal(address indexed asset, address indexed recipient, uint256 amount);
    event AgentToAgentTransfer(address indexed asset, address indexed recipient, uint256 amount);

    constructor() {
        factory = msg.sender;
        initialized = true;
    }

    function financialLimitVersion() external pure returns (uint256) {
        return FINANCIAL_LIMIT_VERSION;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function initialize(
        address owner_,
        bytes32 templateId_,
        bytes32 configHash_,
        string calldata metadataURI_,
        address initialOperator
    ) external {
        if (msg.sender != factory) revert NotFactory();
        if (initialized) revert AlreadyInitialized();
        if (owner_ == address(0)) revert InvalidOwner();

        initialized = true;
        owner = owner_;
        active = false;
        templateId = templateId_;
        configHash = configHash_;
        metadataURI = metadataURI_;

        if (initialOperator != address(0)) {
            agentOperators[initialOperator] = true;
            emit AgentOperatorSet(initialOperator, true);
        }

        emit Initialized(owner_, msg.sender, initialOperator, templateId_, configHash_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }

    function setActive(bool active_) external onlyOwner {
        active = active_;
        emit AgentActivationSet(active_);
    }

    function setAgentOperator(address operator, bool active_) external onlyOwner {
        if (operator == address(0)) revert InvalidOwner();
        agentOperators[operator] = active_;
        emit AgentOperatorSet(operator, active_);
    }

    function setPermission(
        address operator,
        address target,
        bytes4 selector,
        bool allowed,
        uint64 expiresAt,
        uint128 maxNativeValue
    ) external onlyOwner {
        if (operator == address(0) || target == address(0)) revert InvalidOwner();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert PermissionExpired();

        permissions[operator][target][selector] = Permission({
            allowed: allowed,
            expiresAt: expiresAt,
            maxNativeValue: maxNativeValue
        });

        emit PermissionSet(operator, target, selector, allowed, expiresAt, maxNativeValue);
    }

    function setApprovalSpender(
        address operator,
        address asset,
        address spender,
        bool allowed
    ) external onlyOwner {
        if (operator == address(0) || asset == address(0) || spender == address(0)) revert InvalidOwner();
        approvalSpenders[operator][asset][spender] = allowed;
        emit ApprovalSpenderSet(operator, asset, spender, allowed);
    }

    function setFinancialLimit(
        address operator,
        address target,
        bytes4 selector,
        address asset,
        uint128 maxAmountPerCall,
        uint128 maxAmountPerWindow,
        uint64 windowDuration
    ) external onlyOwner {
        if (operator == address(0) || target == address(0) || asset == address(0)) revert InvalidOwner();
        if (!_isFinancialSelector(selector)) revert InvalidFinancialLimit();

        if (maxAmountPerCall == 0 && maxAmountPerWindow == 0) {
            delete financialLimits[operator][target][selector][asset];
            emit FinancialLimitSet(operator, target, selector, asset, 0, 0, 0);
            return;
        }

        if (
            maxAmountPerCall == 0 ||
            maxAmountPerWindow == 0 ||
            maxAmountPerCall > maxAmountPerWindow ||
            windowDuration < MIN_FINANCIAL_WINDOW ||
            windowDuration > MAX_FINANCIAL_WINDOW
        ) revert InvalidFinancialLimit();

        financialLimits[operator][target][selector][asset] = FinancialLimit({
            maxAmountPerCall: maxAmountPerCall,
            maxAmountPerWindow: maxAmountPerWindow,
            spentInWindow: 0,
            windowStart: uint64(block.timestamp),
            windowDuration: windowDuration
        });

        emit FinancialLimitSet(
            operator,
            target,
            selector,
            asset,
            maxAmountPerCall,
            maxAmountPerWindow,
            windowDuration
        );
    }

    function setAgentMetadata(bytes32 configHash_, string calldata metadataURI_) external onlyOwner {
        configHash = configHash_;
        metadataURI = metadataURI_;
        emit AgentMetadataUpdated(configHash_, metadataURI_);
    }

    /// @notice Register this smart account as an ERC-8004 agent.
    /// @dev The identity NFT is minted to this account because the registry sees this account
    ///      as msg.sender. That keeps the agent identity attached to the same programmable account
    ///      the user controls through this contract's owner or delegated agent permissions.
    /// @notice Transfer a supported ERC20 token to another agent owned by the same owner.
    /// @dev The factory registry makes the recipient restriction enforceable onchain; external addresses cannot be used.
    function transferToAgent(address token, address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != address(this)) revert InvalidAgentRecipient();
        if (!ICentryAgentFactoryRegistry(factory).isCentryAgentAccount(recipient)) revert InvalidAgentRecipient();
        if (CentryOnchainAgentAccount(payable(recipient)).owner() != owner) revert InvalidAgentRecipient();
        IERC20(token).safeTransfer(recipient, amount);
        emit AgentToAgentTransfer(token, recipient, amount);
    }

    /// @notice Withdraw native funds from the agent account back to the owner.
    /// @dev This remains available even when the agent is inactive, so the owner can recover funds
    ///      without reactivating the agent or granting the runner any permission.
    function withdrawNative(uint256 amount) external onlyOwner nonReentrant {
        (bool success,) = payable(owner).call{value: amount}("");
        if (!success) revert WithdrawalFailed();
        emit AgentWithdrawal(address(0), owner, amount);
    }

    /// @notice Withdraw ERC20 funds from the agent account back to the owner.
    /// @dev The destination is always the current owner; the owner cannot redirect this helper to
    ///      an arbitrary address by mistake. Use owner-controlled execution for advanced routing.
    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) revert InvalidWithdrawalToken();
        IERC20(token).safeTransfer(owner, amount);
        emit AgentWithdrawal(token, owner, amount);
    }

    function registerERC8004Identity(
        address identityRegistry,
        string calldata agentURI
    ) external onlyOwner returns (uint256 agentId) {
        if (identityRegistry == address(0)) revert InvalidIdentityRegistry();
        if (erc8004IdentityRegistry != address(0)) revert IdentityAlreadyRegistered();

        agentId = ICentryERC8004IdentityRegistry(identityRegistry).register(agentURI);
        erc8004IdentityRegistry = identityRegistry;
        erc8004AgentId = agentId;

        emit ERC8004IdentityRegistered(identityRegistry, agentId, agentURI);
    }

    /// @notice Update the ERC-8004 registration file URI for the linked agent.
    function updateERC8004IdentityURI(string calldata agentURI_) external onlyOwner {
        address identityRegistry = erc8004IdentityRegistry;
        if (identityRegistry == address(0)) revert IdentityNotRegistered();

        ICentryERC8004IdentityRegistry(identityRegistry).setAgentURI(
            erc8004AgentId,
            agentURI_
        );

        emit ERC8004IdentityURIUpdated(erc8004AgentId, agentURI_);
    }

    function canExecute(
        address operator,
        address target,
        bytes4 selector,
        uint256 value
    ) public view returns (bool) {
        if (!agentOperators[operator] || target == address(0)) return false;
        Permission memory permission = permissions[operator][target][selector];
        if (!permission.allowed) return false;
        if (permission.expiresAt != 0 && block.timestamp > permission.expiresAt) return false;
        if (value > permission.maxNativeValue) return false;
        return true;
    }

    function execute(address target, uint256 value, bytes calldata data)
        external
        nonReentrant
        returns (bytes memory result)
    {
        if (!active) revert NotAgent();
        if (!agentOperators[msg.sender]) revert NotAgent();
        bytes4 selector = _selector(data);
        _checkPermission(msg.sender, target, selector, value);
        _enforceFinancialLimit(msg.sender, target, selector, data);

        (bool success, bytes memory returnData) = target.call{value: value}(data);
        if (!success) _revertWithData(returnData);

        emit AgentExecuted(msg.sender, target, value, selector, keccak256(data));
        return returnData;
    }

    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata data
    ) external nonReentrant returns (bytes[] memory results) {
        if (!active) revert NotAgent();
        if (!agentOperators[msg.sender]) revert NotAgent();
        uint256 length = targets.length;
        if (length == 0 || length > MAX_BATCH_CALLS || values.length != length || data.length != length) {
            revert BatchTooLarge();
        }

        results = new bytes[](length);
        for (uint256 i = 0; i < length; i++) {
            bytes4 selector = _selector(data[i]);
            _checkPermission(msg.sender, targets[i], selector, values[i]);
            _enforceFinancialLimit(msg.sender, targets[i], selector, data[i]);

            (bool success, bytes memory returnData) = targets[i].call{value: values[i]}(data[i]);
            if (!success) _revertWithData(returnData);

            results[i] = returnData;
            emit AgentExecuted(msg.sender, targets[i], values[i], selector, keccak256(data[i]));
        }

        emit AgentBatchExecuted(msg.sender, length);
    }

    function executeAsOwner(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        nonReentrant
        returns (bytes memory result)
    {
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        if (!success) _revertWithData(returnData);
        return returnData;
    }

    function executeBatchAsOwner(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata data
    ) external onlyOwner nonReentrant returns (bytes[] memory results) {
        uint256 length = targets.length;
        if (length == 0 || length > MAX_BATCH_CALLS || values.length != length || data.length != length) {
            revert BatchTooLarge();
        }

        results = new bytes[](length);
        for (uint256 i = 0; i < length; i++) {
            (bool success, bytes memory returnData) = targets[i].call{value: values[i]}(data[i]);
            if (!success) _revertWithData(returnData);
            results[i] = returnData;
        }
    }

    function _isFinancialSelector(bytes4 selector) internal pure returns (bool) {
        return
            selector == APPROVE_SELECTOR ||
            selector == TRANSFER_SELECTOR ||
            selector == TRANSFER_FROM_SELECTOR ||
            selector == SUPPLY_SELECTOR ||
            selector == WITHDRAW_SELECTOR ||
            selector == BORROW_SELECTOR ||
            selector == REPAY_SELECTOR ||
            selector == SWAP_EXACT_INPUT_SINGLE_SELECTOR ||
            selector == TRANSFER_TO_AGENT_SELECTOR;
    }

    function _financialCallAssetAmount(
        address target,
        bytes4 selector,
        bytes calldata data
    ) internal pure returns (address asset, uint256 amount, address counterparty) {
        if (data.length < 4) revert InvalidFinancialCall();

        if (selector == APPROVE_SELECTOR || selector == TRANSFER_SELECTOR) {
            asset = target;
            (counterparty, amount) = abi.decode(data[4:], (address, uint256));
            return (asset, amount, counterparty);
        }

        if (selector == TRANSFER_FROM_SELECTOR) {
            asset = target;
            (, counterparty, amount) = abi.decode(data[4:], (address, address, uint256));
            return (asset, amount, counterparty);
        }

        if (
            selector == SUPPLY_SELECTOR ||
            selector == WITHDRAW_SELECTOR ||
            selector == BORROW_SELECTOR ||
            selector == REPAY_SELECTOR
        ) {
            (asset, amount) = abi.decode(data[4:], (address, uint256));
            if (asset == address(0)) revert InvalidFinancialCall();
            return (asset, amount, address(0));
        }

        if (selector == TRANSFER_TO_AGENT_SELECTOR) {
            (asset, counterparty, amount) = abi.decode(data[4:], (address, address, uint256));
            if (asset == address(0) || counterparty == address(0)) revert InvalidFinancialCall();
            return (asset, amount, counterparty);
        }

        if (selector == SWAP_EXACT_INPUT_SINGLE_SELECTOR) {
            (
                address tokenIn,
                address tokenOut,
                uint24 fee,
                address recipient,
                uint256 deadline,
                uint256 amountIn,
                uint256 amountOutMinimum,
                uint160 sqrtPriceLimitX96
            ) = abi.decode(
                data[4:],
                (address, address, uint24, address, uint256, uint256, uint256, uint160)
            );
            tokenOut;
            fee;
            recipient;
            deadline;
            amountOutMinimum;
            sqrtPriceLimitX96;
            if (tokenIn == address(0) || recipient == address(0)) revert InvalidFinancialCall();
            return (tokenIn, amountIn, recipient);
        }

        revert InvalidFinancialCall();
    }

    function _enforceFinancialLimit(
        address operator,
        address target,
        bytes4 selector,
        bytes calldata data
    ) internal {
        if (!_isFinancialSelector(selector)) return;

        (address asset, uint256 amount, address counterparty) = _financialCallAssetAmount(target, selector, data);

        if (selector == APPROVE_SELECTOR && !approvalSpenders[operator][asset][counterparty]) {
            revert ApprovalSpenderNotAllowed();
        }

        if (selector == TRANSFER_SELECTOR || selector == TRANSFER_FROM_SELECTOR) {
            if (!_isAllowedFinancialRecipient(counterparty)) revert FinancialRecipientNotAllowed();
        }

        if (selector == SWAP_EXACT_INPUT_SINGLE_SELECTOR && counterparty != address(this)) {
            revert FinancialRecipientNotAllowed();
        }

        FinancialLimit storage limit = financialLimits[operator][target][selector][asset];

        if (
            limit.maxAmountPerCall == 0 ||
            limit.maxAmountPerWindow == 0 ||
            limit.windowDuration == 0
        ) revert FinancialLimitNotConfigured();

        if (amount > limit.maxAmountPerCall) revert FinancialLimitExceeded();

        if (block.timestamp >= uint256(limit.windowStart) + uint256(limit.windowDuration)) {
            limit.windowStart = uint64(block.timestamp);
            limit.spentInWindow = 0;
        }

        if (amount > uint256(limit.maxAmountPerWindow) - uint256(limit.spentInWindow)) {
            revert FinancialLimitExceeded();
        }

        limit.spentInWindow += uint128(amount);
    }

    function _isAllowedFinancialRecipient(address recipient) internal view returns (bool) {
        if (recipient == owner) return true;

        try ICentryAgentFactoryRegistry(factory).isCentryAgentAccount(recipient) returns (bool registered) {
            if (!registered) return false;
        } catch {
            return false;
        }

        try CentryOnchainAgentAccount(payable(recipient)).owner() returns (address recipientOwner) {
            return recipientOwner == owner;
        } catch {
            return false;
        }
    }

    function _checkPermission(address operator, address target, bytes4 selector, uint256 value) internal view {
        if (!canExecute(operator, target, selector, value)) {
            Permission memory permission = permissions[operator][target][selector];
            if (!permission.allowed) revert AgentNotPermitted();
            if (permission.expiresAt != 0 && block.timestamp > permission.expiresAt) revert PermissionExpired();
            revert NativeValueTooHigh();
        }
    }

    function _selector(bytes calldata data) internal pure returns (bytes4 selector) {
        if (data.length < 4) return bytes4(0);
        assembly {
            selector := calldataload(data.offset)
        }
    }

    function _revertWithData(bytes memory returnData) internal pure {
        if (returnData.length == 0) revert CallFailed();
        assembly {
            revert(add(returnData, 32), mload(returnData))
        }
    }

    receive() external payable {}
}
