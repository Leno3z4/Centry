// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../core/CentryRevenueToCENTUnitFlowAdapter.sol";
import "../core/CentryUnitFlowSwapAdapter.sol";

interface IVm {
    function etch(address target, bytes calldata code) external;
    function expectRevert(bytes4 selector) external;
}

contract AdapterTestToken {
    string public name = "Test Token";
    string public symbol = "TEST";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

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
        require(balanceOf[from] >= amount, "balance");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockUnitFlowV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(
        ExactInputParams calldata params
    ) external payable returns (uint256 amountOut) {
        require(block.timestamp <= params.deadline, "expired");
        require(params.path.length >= 43, "path");

        address tokenIn;
        address tokenOut;

        assembly {
            tokenIn := shr(96, calldataload(params.path.offset))
            tokenOut := shr(
                96,
                calldataload(
                    add(
                        params.path.offset,
                        sub(params.path.length, 20)
                    )
                )
            )
        }

        (bool ok, bytes memory result) = tokenIn.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                msg.sender,
                address(this),
                params.amountIn
            )
        );
        require(
            ok && (result.length == 0 || abi.decode(result, (bool))),
            "input"
        );

        amountOut = params.amountIn;
        require(amountOut >= params.amountOutMinimum, "minimum");

        (ok, result) = tokenOut.call(
            abi.encodeWithSignature(
                "transfer(address,uint256)",
                params.recipient,
                amountOut
            )
        );
        require(
            ok && (result.length == 0 || abi.decode(result, (bool))),
            "output"
        );
    }
}

contract CentryUnitFlowAdapterTest {
    IVm internal constant vm =
        IVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant ARC_USDC =
        0x3600000000000000000000000000000000000000;

    AdapterTestToken internal fakeUSDC;
    AdapterTestToken internal cent;
    MockUnitFlowV3Router internal router;
    CentryRevenueToCENTUnitFlowAdapter internal revenueAdapter;
    CentryUnitFlowSwapAdapter internal swapAdapter;

    function setUp() public {
        fakeUSDC = new AdapterTestToken();
        cent = new AdapterTestToken();
        router = new MockUnitFlowV3Router();

        vm.etch(ARC_USDC, address(fakeUSDC).code);

        revenueAdapter = new CentryRevenueToCENTUnitFlowAdapter(
            address(router),
            address(cent),
            address(this)
        );

        swapAdapter = new CentryUnitFlowSwapAdapter(
            address(router),
            address(cent),
            address(this)
        );
    }

    function testRevenueAdapterDirectV3Swap() external {
        setUp();

        AdapterTestToken(ARC_USDC).mint(address(this), 10e6);
        cent.mint(address(router), 10e6);

        AdapterTestToken(ARC_USDC).approve(address(revenueAdapter), 10e6);
        revenueAdapter.setAuthorizedCaller(address(this));

        bytes memory data = abi.encode(
            block.timestamp + 1 hours,
            uint24(3000)
        );

        uint256 beforeBalance = cent.balanceOf(address(this));

        uint256 amountOut = revenueAdapter.swap(
            ARC_USDC,
            address(cent),
            10e6,
            9e6,
            address(this),
            data
        );

        require(amountOut == 10e6, "wrong output");
        require(
            cent.balanceOf(address(this)) == beforeBalance + 10e6,
            "recipient balance"
        );
    }

    function testRevenueAdapterRejectsMalformedSwapData() external {
        setUp();

        revenueAdapter.setAuthorizedCaller(address(this));

        vm.expectRevert(
            CentryRevenueToCENTUnitFlowAdapter.InvalidSwapData.selector
        );

        revenueAdapter.swap(
            ARC_USDC,
            address(cent),
            1e6,
            1,
            address(this),
            hex"01"
        );
    }

    function testRevenueAdapterRejectsInvalidPathEndpoints() external {
        setUp();

        AdapterTestToken(ARC_USDC).mint(address(this), 1e6);
        cent.mint(address(router), 1e6);

        AdapterTestToken(ARC_USDC).approve(address(revenueAdapter), 1e6);
        revenueAdapter.setAuthorizedCaller(address(this));

        bytes memory badPath = abi.encodePacked(
            address(0x1111),
            uint24(3000),
            address(cent)
        );

        bytes memory data = abi.encode(
            block.timestamp + 1 hours,
            badPath
        );

        (bool ok,) = address(revenueAdapter).call(
            abi.encodeWithSelector(
                revenueAdapter.swap.selector,
                ARC_USDC,
                address(cent),
                1e6,
                1,
                address(this),
                data
            )
        );

        require(!ok, "invalid path accepted");
    }

    function testSelfRepayAdapterV3Swap() external {
        setUp();

        cent.mint(address(swapAdapter), 10e6);
        AdapterTestToken(ARC_USDC).mint(address(router), 10e6);

        swapAdapter.setAuthorizedCaller(address(this));
        swapAdapter.setOutputSupported(ARC_USDC, true);

        bytes memory data = abi.encode(
            block.timestamp + 1 hours,
            uint24(3000)
        );

        uint256 beforeBalance = AdapterTestToken(ARC_USDC).balanceOf(address(this));

        uint256 amountOut = swapAdapter.swap(
            address(cent),
            ARC_USDC,
            10e6,
            9e6,
            address(this),
            data
        );

        require(amountOut == 10e6, "wrong output");
        require(
            AdapterTestToken(ARC_USDC).balanceOf(address(this)) ==
                beforeBalance + 10e6,
            "recipient balance"
        );
    }
}
