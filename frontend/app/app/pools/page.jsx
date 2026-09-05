'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useSendTransaction } from 'wagmi';
import { encodeFunctionData, getAddress, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { MARKETS } from '../../../constants/markets';
import styles from './pools.module.css';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const LIQUIDITY_ROUTER = '0x0ef57CC428c851e9a9b7cD97190EF3D3EFe4B631';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';

const ERC20_WRITE_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

const FACTORY_ABI = [
  { type: 'function', name: 'getPair', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'createPair', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'address' }] },
];

const ROUTER_ABI = [
  { type: 'function', name: 'addLiquidity', stateMutability: 'nonpayable', inputs: [
    { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' },
  ], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'addLiquidityUSDC', stateMutability: 'payable', inputs: [
    { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' },
  ], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'removeLiquidity', stateMutability: 'nonpayable', inputs: [
    { type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' },
  ], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'removeLiquidityUSDC', stateMutability: 'nonpayable', inputs: [
    { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'address' }, { type: 'uint256' },
  ], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
];

const PAIR_ABI = [
  { type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'token1', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const FEATURED_TOKENS = MARKETS.filter((market) => market.status === 'live' && market.address).map((market) => ({ ...market, address: getAddress(market.address) }));

function shortAddress(address) { return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—'; }
function formatUnitsSafe(value, decimals = 18, max = 4) {
  try { const number = Number(value == null ? 0 : value) / 10 ** decimals; return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: max }) : '0'; } catch { return '0'; }
}
function tokenIcon(symbol) { return symbol === 'CENT' ? 'C' : symbol === 'EURC' ? '€' : symbol === 'cirBTC' ? '₿' : '$'; }
function poolLabel(pool) { return `${pool.token0Meta?.symbol || 'TOKEN'} / ${pool.token1Meta?.symbol || 'TOKEN'}`; }
function isUsdcPool(pool) { return pool.token0?.toLowerCase() === WUSDC.toLowerCase() || pool.token1?.toLowerCase() === WUSDC.toLowerCase(); }
function marketForAddress(address) { return FEATURED_TOKENS.find((market) => market.address.toLowerCase() === address?.toLowerCase()) || null; }

export default function Page() {
  return <Providers><AppShell><PoolsContent /></AppShell></Providers>;
}

function PoolsContent() {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [tab, setTab] = useState('explore');
  const [pools, setPools] = useState([]);
  const [poolCount, setPoolCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPool, setSelectedPool] = useState(null);
  const [action, setAction] = useState(null);
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [createA, setCreateA] = useState('');
  const [createB, setCreateB] = useState('');
  const [notice, setNotice] = useState('');
  const [writeHash, setWriteHash] = useState(null);

  const loadPools = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = address ? `?address=${encodeURIComponent(address)}` : '';
      const response = await fetch(`/api/unitflow/pools${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load UnitFlow pools.');
      setPools(data.data?.pools || []); setPoolCount(Number(data.data?.count || 0));
    } catch (caughtError) { setError(caughtError?.message || 'Unable to load UnitFlow pools.'); }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => { loadPools(); }, [loadPools]);
  const myPools = useMemo(() => pools.filter((pool) => pool.hasPosition), [pools]);

  // Arc Testnet does not expose Multicall3, so read the pair directly with
  // individual eth_call requests instead of wagmi's useReadContracts.
  const { data: pairBalance } = useReadContract({
    address: selectedPool?.pair,
    abi: PAIR_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(selectedPool?.pair && address) },
  });

  const openAdd = (pool = null) => { setSelectedPool(pool); setAction('add'); setTokenA(pool?.token0 || FEATURED_TOKENS[0]?.address || ''); setTokenB(pool?.token1 || FEATURED_TOKENS[1]?.address || ''); setAmountA(''); setAmountB(''); setNotice(''); setError(''); };
  const openRemove = (pool) => { setSelectedPool(pool); setAction('remove'); setNotice(''); setError(''); };
  const openCreate = () => { setAction('create'); setSelectedPool(null); setCreateA(''); setCreateB(''); setNotice(''); setError(''); };
  const closePanel = () => { setAction(null); setSelectedPool(null); setNotice(''); setError(''); };

  const submitCreate = async () => {
    if (!isConnected || !createA || !createB || createA.toLowerCase() === createB.toLowerCase()) return;
    try {
      const hash = await sendTransactionAsync({ to: FACTORY, data: encodeFunctionData({ abi: FACTORY_ABI, functionName: 'createPair', args: [getAddress(createA), getAddress(createB)] }), value: 0n, chainId: ARC_CHAIN_ID });
      setWriteHash(hash); setNotice('Pool created. Add the initial liquidity next.'); await loadPools();
    } catch (caughtError) { setError(caughtError?.shortMessage || caughtError?.message || 'Pool creation failed.'); }
  };

  const submitAdd = async () => {
    if (!isConnected || !tokenA || !tokenB || !amountA || !amountB) return;
    try {
      const tokenAAddress = getAddress(tokenA); const tokenBAddress = getAddress(tokenB);
      const amountARaw = parseUnits(amountA, marketForAddress(tokenAAddress)?.decimals ?? 18);
      const amountBRaw = parseUnits(amountB, marketForAddress(tokenBAddress)?.decimals ?? 18);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      const usdcSide = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() || tokenBAddress.toLowerCase() === WUSDC.toLowerCase();
      if (usdcSide) {
        const token = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() ? tokenBAddress : tokenAAddress;
        const tokenAmount = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() ? amountBRaw : amountARaw;
        const usdcAmount = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() ? amountARaw : amountBRaw;
        await sendTransactionAsync({ to: token, data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, tokenAmount] }), value: 0n, chainId: ARC_CHAIN_ID });
        const hash = await sendTransactionAsync({ to: LIQUIDITY_ROUTER, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'addLiquidityUSDC', args: [token, tokenAmount, 0n, 0n, address, deadline] }), value: usdcAmount * 10n ** 12n, chainId: ARC_CHAIN_ID });
        setWriteHash(hash);
      } else {
        await sendTransactionAsync({ to: tokenAAddress, data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, amountARaw] }), value: 0n, chainId: ARC_CHAIN_ID });
        await sendTransactionAsync({ to: tokenBAddress, data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, amountBRaw] }), value: 0n, chainId: ARC_CHAIN_ID });
        const hash = await sendTransactionAsync({ to: LIQUIDITY_ROUTER, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'addLiquidity', args: [tokenAAddress, tokenBAddress, amountARaw, amountBRaw, 0n, 0n, address, deadline] }), value: 0n, chainId: ARC_CHAIN_ID });
        setWriteHash(hash);
      }
      setNotice('Liquidity transaction submitted.'); await loadPools();
    } catch (caughtError) { setError(caughtError?.shortMessage || caughtError?.message || 'Adding liquidity failed.'); }
  };

  const submitRemove = async () => {
    if (!selectedPool?.pair || !address || !pairBalance || pairBalance === 0n) return;
    try {
      const liquidity = pairBalance; const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      await sendTransactionAsync({ to: selectedPool.pair, data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, liquidity] }), value: 0n, chainId: ARC_CHAIN_ID });
      const args = isUsdcPool(selectedPool)
        ? [selectedPool.token0?.toLowerCase() === WUSDC.toLowerCase() ? selectedPool.token1 : selectedPool.token0, liquidity, 0n, 0n, address, deadline]
        : [selectedPool.token0, selectedPool.token1, liquidity, 0n, 0n, address, deadline];
      const abi = isUsdcPool(selectedPool) ? [ROUTER_ABI[3]] : [ROUTER_ABI[2]];
      const fn = isUsdcPool(selectedPool) ? 'removeLiquidityUSDC' : 'removeLiquidity';
      const hash = await sendTransactionAsync({ to: LIQUIDITY_ROUTER, data: encodeFunctionData({ abi, functionName: fn, args }), value: 0n, chainId: ARC_CHAIN_ID });
      setWriteHash(hash); setNotice('Liquidity removal submitted.'); await loadPools();
    } catch (caughtError) { setError(caughtError?.shortMessage || caughtError?.message || 'Removing liquidity failed.'); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div><div className={styles.eyebrow}>CENTRY × UNITFLOW</div><h1>Liquidity, <em>without the detour.</em></h1><p>Explore UnitFlow v2.5 pools, manage your positions, and create new markets without leaving Centry.</p></div>
        <div className={styles.heroOrbit}><span>UNITFLOW</span><b>v2.5</b></div>
      </div>
      <div className={styles.controlBar}>
        <div className={styles.tabs}>
          <button className={tab === 'explore' ? styles.tabActive : ''} onClick={() => setTab('explore')}>Explore <b>{poolCount}</b></button>
          <button className={tab === 'mine' ? styles.tabActive : ''} onClick={() => setTab('mine')}>My pools <b>{myPools.length}</b></button>
        </div>
        <div className={styles.actions}><button className={styles.refresh} onClick={loadPools} disabled={loading}>↻ Refresh</button><button className={styles.create} onClick={openCreate}>＋ Create pool</button></div>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {loading ? <div className={styles.empty}>Loading UnitFlow liquidity…</div> : (tab === 'mine' ? myPools : pools).length === 0 ? <div className={styles.empty}><strong>No pools here yet.</strong><span>Create a UnitFlow pool or switch back to Explore.</span></div> :
        <div className={styles.grid}>{(tab === 'mine' ? myPools : pools).map((pool, index) => (
          <article key={pool.pair} className={`${styles.poolCard} ${index === 0 ? styles.poolFeatured : ''}`}>
            <div className={styles.poolTop}><div className={styles.tokenPair}><span className={`${styles.poolToken} ${styles.poolTokenA}`}>{tokenIcon(pool.token0Meta?.symbol)}</span><span className={`${styles.poolToken} ${styles.poolTokenB}`}>{tokenIcon(pool.token1Meta?.symbol)}</span></div><span className={styles.unitflowTag}>UNITFLOW / V2.5</span></div>
            <h3>{poolLabel(pool)}</h3><p className={styles.poolAddress}>{shortAddress(pool.pair)}</p>
            <div className={styles.metrics}><div><span>Reserve A</span><strong>{formatUnitsSafe(pool.reserve0, pool.token0Meta?.decimals ?? 18)}</strong></div><div><span>Reserve B</span><strong>{formatUnitsSafe(pool.reserve1, pool.token1Meta?.decimals ?? 18)}</strong></div><div><span>My LP</span><strong>{pool.hasPosition ? formatUnitsSafe(pool.userLiquidity) : '—'}</strong></div></div>
            <div className={styles.cardActions}><button onClick={() => openAdd(pool)}>Add liquidity</button>{pool.hasPosition && <button className={styles.ghostButton} onClick={() => openRemove(pool)}>Remove</button>}</div>
          </article>
        ))}</div>}

      {action && <div className={styles.overlay} onClick={closePanel}><div className={styles.drawer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.drawerHead}><div><span className={styles.eyebrow}>UNITFLOW / ACTION</span><h2>{action === 'create' ? 'Create a pool' : action === 'add' ? 'Add liquidity' : 'Remove liquidity'}</h2></div><button onClick={closePanel}>×</button></div>
        {action === 'create' && <div className={styles.form}><p>Create a permissionless UnitFlow v2.5 pair directly through the Factory.</p><input placeholder="Token A address" value={createA} onChange={(event) => setCreateA(event.target.value)} /><input placeholder="Token B address" value={createB} onChange={(event) => setCreateB(event.target.value)} /><button className={styles.create} disabled={!isConnected || !createA || !createB || isPending} onClick={submitCreate}>{isConnected ? 'Create pool' : 'Connect wallet'}</button></div>}
        {action === 'add' && <div className={styles.form}><p>Approve the token(s), then UnitFlow's liquidity router will deposit them into the pool.</p><input placeholder="Token A address" value={tokenA} onChange={(event) => setTokenA(event.target.value)} /><input placeholder="Amount A" value={amountA} onChange={(event) => setAmountA(event.target.value)} /><input placeholder="Token B address" value={tokenB} onChange={(event) => setTokenB(event.target.value)} /><input placeholder="Amount B" value={amountB} onChange={(event) => setAmountB(event.target.value)} /><button className={styles.create} disabled={!isConnected || !tokenA || !tokenB || !amountA || !amountB || isPending} onClick={submitAdd}>{isConnected ? 'Approve & add liquidity' : 'Connect wallet'}</button></div>}
        {action === 'remove' && <div className={styles.form}><p>Your current LP balance is <strong>{formatUnitsSafe(pairBalance, 18)}</strong>. You will approve the LP token and then remove the position.</p><button className={styles.create} disabled={!isConnected || !pairBalance || isPending} onClick={submitRemove}>{isConnected ? 'Approve & remove liquidity' : 'Connect wallet'}</button></div>}
        {notice && <div className={styles.notice}>{notice}</div>}{writeHash && <a className={styles.txLink} href={`https://testnet.arcscan.app/tx/${writeHash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
      </div></div>}
    </div>
  );
}
