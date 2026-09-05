import { NextResponse } from 'next/server';
import { createPublicClient, encodeAbiParameters, encodeFunctionData, http } from 'viem';
import { arc } from 'viem/chains';

const TOWER_BASE_URL = 'https://www.tower.exchange/api/public';
const ARC_CHAIN_ID = 5042002;
const CENT = '0x76e6d50D3151f0B4645ac0E53584F4204Fc6f0e3';
const USDC = '0x3600000000000000000000000000000000000000';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const UNITFLOW_UNIVERSAL_ROUTER = '0xEaF3195bE51861632cd32850973C9515DA48e76F';
const WUSDC_SCALE = 10n ** 12n;
const ROUTER_MSG_SENDER = '0x0000000000000000000000000000000000000002';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const UNITFLOW_UNIVERSAL_ROUTER_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
];

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
];

function validAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isCentPair(inputToken, outputToken) {
  return (
    (inputToken.toLowerCase() === CENT.toLowerCase() && outputToken.toLowerCase() === USDC.toLowerCase()) ||
    (inputToken.toLowerCase() === USDC.toLowerCase() && outputToken.toLowerCase() === CENT.toLowerCase())
  );
}

function parseQuoteBigInt(quote, key) {
  try {
    return BigInt(String(quote?.[key] || '0'));
  } catch {
    return 0n;
  }
}

async function getCentAllowance(userAddress, amountIn) {
  const rpcUrl = process.env.ARC_RPC_URL || process.env.ARC_RPC_URL_VARIABLE || 'https://rpc.testnet.arc.network';
  const client = createPublicClient({
    chain: { ...arc, id: ARC_CHAIN_ID },
    transport: http(rpcUrl),
  });

  return client.readContract({
    address: CENT,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [userAddress, UNITFLOW_UNIVERSAL_ROUTER],
  }) >= amountIn;
}

async function buildCentSwap(quote, userAddress) {
  const inputToken = String(quote.inputToken || '').toLowerCase();
  const outputToken = String(quote.outputToken || '').toLowerCase();
  const amountIn = parseQuoteBigInt(quote, 'inputAmount');
  const minOut = parseQuoteBigInt(quote, 'minOut');

  if (!validAddress(userAddress) || !isCentPair(inputToken, outputToken)) {
    throw new Error('Invalid CENT swap request.');
  }

  if (amountIn <= 0n || minOut <= 0n) {
    throw new Error('Invalid CENT swap amount.');
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  if (inputToken === CENT.toLowerCase()) {
    const nativeMinOut = minOut / WUSDC_SCALE;
    if (nativeMinOut <= 0n) throw new Error('CENT quote is below one USDC base unit.');

    const path = [CENT, WUSDC];
    const commands = '0x080c';
    const inputs = [
      encodeAbiParameters(
        [
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'address[]' },
          { type: 'bool' },
        ],
        [ROUTER_MSG_SENDER, amountIn, minOut, path, true],
      ),
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [ROUTER_MSG_SENDER, nativeMinOut],
      ),
    ];

    const approved = await getCentAllowance(userAddress, amountIn);

    return {
      approval: approved
        ? null
        : {
            to: CENT,
            data: encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'approve',
              args: [UNITFLOW_UNIVERSAL_ROUTER, amountIn],
            }),
            value: '0',
          },
      swap: {
        to: UNITFLOW_UNIVERSAL_ROUTER,
        data: encodeFunctionData({
          abi: UNITFLOW_UNIVERSAL_ROUTER_ABI,
          functionName: 'execute',
          args: [commands, inputs, deadline],
        }),
        value: '0',
      },
      chainId: ARC_CHAIN_ID,
      provider: 'UnitFlow v2.5',
      route: 'CENT → WUSDC → USDC',
    };
  }

  const nativeAmount = amountIn * WUSDC_SCALE;
  const path = [WUSDC, CENT];
  const commands = '0x0b08';
  const inputs = [
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [ROUTER_MSG_SENDER, nativeAmount],
    ),
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address[]' },
        { type: 'bool' },
      ],
      [ROUTER_MSG_SENDER, nativeAmount, minOut, path, false],
    ),
  ];

  return {
    approval: null,
    swap: {
      to: UNITFLOW_UNIVERSAL_ROUTER,
      data: encodeFunctionData({
        abi: UNITFLOW_UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: [commands, inputs, deadline],
      }),
      value: nativeAmount.toString(),
    },
    chainId: ARC_CHAIN_ID,
    provider: 'UnitFlow v2.5',
    route: 'USDC → WUSDC → CENT',
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { quote, userAddress } = body || {};

    if (!quote || typeof quote !== 'object' || !validAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'A valid swap quote and wallet address are required.' },
        { status: 400 },
      );
    }

    if (Number(quote.chainId || ARC_CHAIN_ID) !== ARC_CHAIN_ID) {
      return NextResponse.json(
        { success: false, error: 'Only Arc Testnet swaps are enabled in Centry right now.' },
        { status: 400 },
      );
    }

    if (isCentPair(quote.inputToken, quote.outputToken)) {
      return NextResponse.json({ success: true, data: await buildCentSwap(quote, userAddress) });
    }

    const apiKey = process.env.TOWER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Tower is not configured. Set TOWER_API_KEY on the server.' },
        { status: 503 },
      );
    }

    const response = await fetch(`${TOWER_BASE_URL}/swap/build-tx`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote, userAddress }),
      cache: 'no-store',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Unable to build the swap transaction.' },
      { status: 502 },
    );
  }
}
