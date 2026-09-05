'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContracts, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData, getAddress, parseUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { MARKETS } from '../../../constants/markets';
import styles from './pools.module.css';

const ARC_CHAIN_ID = 5042002;
const FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5';
const LIQUIDITY_ROUTER = '0x0ef57CC428c851e9a9b7cD97190EF3D3EFe4B631';
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const ARC_NATIVE_USDC = '0x3600000000000000000000000000000000000000';

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

const FEATURED_TOKENS = MARKETS.filter((market) => market.status === 'live' && market.address).map((market) => ({
  ...market,
  address: getAddress(market.address),
}));

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';
}

function formatUnitsSafe(value, decimals = 18, max = 4) {
  try {
    const number = Number(value == null ? 0 : value) / 10 ** decimals;
    return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: max }) : '0';
  } catch {
    return '0';
  }
}

function tokenIcon(symbol) {
  if (symbol === 'CENT') return 'C';
  if (symbol === 'EURC') return '€';
  if (symbol === 'cirBTC') return '₿';
  return '$';
}

function poolLabel(pool) {
  return `${pool.token0Meta?.symbol || 'TOKEN'} / ${pool.token1Meta?.symbol || 'TOKEN'}`;
}

function isUsdcPool(pool) {
  return pool.token0?.toLowerCase() === WUSDC.toLowerCase() || pool.token1?.toLowerCase() === WUSDC.toLowerCase();
}

function marketForAddress(address) {
  return FEATURED_TOKENS.find((market) => market.address.toLowerCase() === address?.toLowerCase()) || null;
}

export default function Page() {
  return (
    <Providers>
      <AppShell>
        <PoolsContent />
      </AppShell>
    </Providers>
  );
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
    setLoading(true);
    setError('');
    try {
      const query = address ? `?address=${encodeURIComponent(address)}` : '';
      const response = await fetch(`/api/unitflow/pools${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load UnitFlow pools.');
      setPools(data.data?.pools || []);
      setPoolCount(Number(data.data?.count || 0));
    } catch (caughtError) {
      setError(caughtError?.message || 'Unable to load UnitFlow pools.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => { loadPools(); }, [loadPools]);

  const myPools = useMemo(() => pools.filter((pool) => pool.hasPosition), [pools]);

  const pairAddress = action === 'add' && tokenA && tokenB ? null : selectedPool?.pair;
  const pairToken0 = selectedPool?.token0;
  const pairToken1 = selectedPool?.token1;
  const pairTokens = selectedPool ? [pairToken0, pairToken1].map((value) => value?.toLowerCase()) : [];

  const { data: pairReads } = useReadContracts({
    contracts: selectedPool && address ? [
      { address: selectedPool.pair, abi: PAIR_ABI, functionName: 'getReserves' },
      { address: selectedPool.pair, abi: PAIR_ABI, functionName: 'totalSupply' },
      { address: selectedPool.pair, abi: PAIR_ABI, functionName: 'balanceOf', args: [address] },
    ] : [],
    query: { enabled: Boolean(selectedPool && address) },
  });

  const openAdd = (pool = null) => {
    setSelectedPool(pool);
    setAction('add');
    setTokenA(pool?.token0 || FEATURED_TOKENS[0]?.address || '');
    setTokenB(pool?.token1 || FEATURED_TOKENS[1]?.address || '');
    setAmountA('');
    setAmountB('');
    setNotice('');
    setError('');
  };

  const openRemove = (pool) => {
    setSelectedPool(pool);
    setAction('remove');
    setNotice('');
    setError('');
  };

  const openCreate = () => {
    setAction('create');
    setSelectedPool(null);
    setCreateA('');
    setCreateB('');
    setNotice('');
    setError('');
  };

  const closePanel = () => {
    setAction(null);
    setSelectedPool(null);
    setNotice('');
    setError('');
  };

  const submitCreate = async () => {
    if (!isConnected || !createA || !createB || createA.toLowerCase() === createB.toLowerCase()) return;
    try {
      const hash = await sendTransactionAsync({
        to: FACTORY,
        data: encodeFunctionData({ abi: FACTORY_ABI, functionName: 'createPair', args: [getAddress(createA), getAddress(createB)] }),
        value: 0n,
        chainId: ARC_CHAIN_ID,
      });
      setWriteHash(hash);
      setNotice('Pool created. Add the initial liquidity next.');
    } catch (caughtError) {
      setError(caughtError?.shortMessage || caughtError?.message || 'Pool creation failed.');
    }
  };

  const submitAdd = async () => {
    if (!isConnected || !tokenA || !tokenB || !amountA || !amountB) return;
    try {
      const tokenAAddress = getAddress(tokenA);
      const tokenBAddress = getAddress(tokenB);
      const amountARaw = parseUnits(amountA, marketForAddress(tokenAAddress)?.decimals ?? 18);
      const amountBRaw = parseUnits(amountB, marketForAddress(tokenBAddress)?.decimals ?? 18);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      const usdcSide = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() || tokenBAddress.toLowerCase() === WUSDC.toLowerCase();

      if (usdcSide) {
        const token = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() ? tokenBAddress : tokenAAddress;
        const tokenAmount = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() ? amountBRaw : amountARaw;
        const nativeAmount = tokenAAddress.toLowerCase() === WUSDC.toLowerCase() ? amountARaw * 10n ** 12n : amountBRaw * 10n ** 12n;
        const approvalHash = await sendTransactionAsync({
          to: token,
          data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, tokenAmount] }),
          value: 0n,
          chainId: ARC_CHAIN_ID,
        });
        setNotice('Token approval submitted. Confirm the liquidity transaction next.');
        await new Promise((resolve) => setTimeout(resolve, 800));
        const hash = await sendTransactionAsync({
          to: LIQUIDITY_ROUTER,
          data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'addLiquidityUSDC', args: [token, tokenAmount, 0n, 0n, address, deadline] }),
          value: nativeAmount,
          chainId: ARC_CHAIN_ID,
        });
        setWriteHash(hash || approvalHash);
      } else {
        const approvalA = await sendTransactionAsync({
          to: tokenAAddress,
          data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, amountARaw] }),
          value: 0n,
          chainId: ARC_CHAIN_ID,
        });
        setNotice('Token A approved. Confirm Token B approval in your wallet.');
        await new Promise((resolve) => setTimeout(resolve, 800));
        await sendTransactionAsync({
          to: tokenBAddress,
          data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, amountBRaw] }),
          value: 0n,
          chainId: ARC_CHAIN_ID,
        });
        setNotice('Both tokens approved. Confirm the liquidity transaction in your wallet.');
        const hash = await sendTransactionAsync({
          to: LIQUIDITY_ROUTER,
          data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'addLiquidity', args: [tokenAAddress, tokenBAddress, amountARaw, amountBRaw, 0n, 0n, address, deadline] }),
          value: 0n,
          chainId: ARC_CHAIN_ID,
        });
        setWriteHash(hash || approvalA);
      }
      setNotice('Liquidity transaction submitted.');
      await loadPools();
    } catch (caughtError) {
      setError(caughtError?.shortMessage || caughtError?.message || 'Adding liquidity failed.');
    }
  };

  const submitRemove = async () => {
    if (!selectedPool?.pair || !address || !pairReads?.[2]?.result) return;
    try {
      const liquidity = pairReads[2].result;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      const hash = await sendTransactionAsync({
        to: selectedPool.pair,
        data: encodeFunctionData({ abi: ERC20_WRITE_ABI, functionName: 'approve', args: [LIQUIDITY_ROUTER, liquidity] }),
        value: 0n,
        chainId: ARC_CHAIN_ID,
      });
      setNotice('LP tokens approved. Confirm the removal transaction next.');
      await new Promise((resolve) => setTimeout(resolve, 800));
      const removeAbi = isUsdcPool(selectedPool) ? ROUTER_ABI[3] : ROUTER_ABI[2];
      const removeFunction = isUsdcPool(selectedPool) ? 'removeLiquidityUSDC' : 'removeLiquidity';
      const args = isUsdcPool(selectedPool)
        ? [selectedPool.token0?.toLowerCase() === WUSDC.toLowerCase() ? selectedPool.token1 : selectedPool.token0, liquidity, 0n, 0n, address, deadline]
        : [selectedPool.token0, selectedPool.token1, liquidity, 0n, 0n, address, deadline];
      await sendTransactionAsync({ to: LIQUIDITY_ROUTER, data: encodeFunctionData({ abi: [removeAbi], functionName: removeFunction, args }), value: 0n, chainId: ARC_CHAIN_ID });
      setWriteHash(hash);
      setNotice('Liquidity removal submitted.');
      await loadPools();
    } catch (caughtError) {
      setError(caughtError?.shortMessage || caughtError?.message || 'Removing liquidity failed.');
    }
  };

  const createToken = (value) => value;

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>CENTRY × UNITFLOW</div>
          <h1>Liquidity, <em>without the detour.</em></h1>
          <p>Explore UnitFlow v2.5 pools, open your positions, seed new markets, and manage LP liquidity without leaving Centry.</p>
        </div>
        <div className={styles.networkTag}><span /> ARC TESTNET <b>5042002</b></div>
      </div>

      <div className={styles.commandBar}>
        <div className={styles.tabs}>
          <button className={tab === 'explore' ? styles.tabActive : ''} onClick={() => setTab('explore')}>Explore <span>{poolCount}</span></button>
          <button className={tab === 'mine' ? styles.tabActive : ''} onClick={() => setTab('mine')}>My pools <span>{myPools.length}</span></button>
        </div>
        <div className={styles.commandActions}>
          <button className={styles.refresh} onClick={loadPools}>{loading ? 'Syncing…' : '↻ Refresh'}</button>
          <button className={styles.createButton} onClick={openCreate}>＋ Create pool</button>
        </div>
      </div>

      {error && !action && <div className={styles.globalError}>{error}</div>}

      {loading ? (
        <div className={styles.grid}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.skeleton} />)}</div>
      ) : (tab === 'mine' && !isConnected) ? (
        <div className={styles.emptyState}><div className={styles.emptyGlyph}>◎</div><h2>Connect to see your positions</h2><p>Your UnitFlow LP tokens stay in your wallet. Connect it to surface your active pools here.</p></div>
      ) : (tab === 'mine' && myPools.length === 0) ? (
        <div className={styles.emptyState}><div className={styles.emptyGlyph}>◇</div><h2>No positions yet</h2><p>Pick a pool from Explore and seed liquidity. Your LP position will appear here after the transaction lands.</p><button onClick={() => setTab('explore')}>Explore pools →</button></div>
      ) : (
        <div className={styles.grid}>
          {(tab === 'mine' ? myPools : pools).map((pool) => {
            const token0Market = marketForAddress(pool.token0);
            const token1Market = marketForAddress(pool.token1);
            const position = pool.hasPosition ? `${formatUnitsSafe(pool.lpBalance, 18, 6)} LP` : 'Not in pool';
            return (
              <article key={pool.pair} className={styles.poolCard}>
                <div className={styles.cardTop}>
                  <div className={styles.tokenPair}>
                    <span className={`${styles.coin} ${token0Market?.id ? styles[`coin_${token0Market.id}`] : ''}`}>{tokenIcon(pool.token0Meta?.symbol)}</span>
                    <span className={`${styles.coin} ${token1Market?.id ? styles[`coin_${token1Market.id}`] : ''}`}>{tokenIcon(pool.token1Meta?.symbol)}</span>
                    <div><strong>{poolLabel(pool)}</strong><small>UnitFlow v2.5 · {shortAddress(pool.pair)}</small></div>
                  </div>
                  <span className={styles.liveDot}>LIVE</span>
                </div>
                <div className={styles.metrics}>
                  <div><span>Reserve A</span><strong>{formatUnitsSafe(pool.reserve0, pool.token0Meta?.decimals ?? 18)}</strong><small>{pool.token0Meta?.symbol}</small></div>
                  <div><span>Reserve B</span><strong>{formatUnitsSafe(pool.reserve1, pool.token1Meta?.decimals ?? 18)}</strong><small>{pool.token1Meta?.symbol}</small></div>
                  <div><span>Your LP</span><strong>{position}</strong><small>{pool.hasPosition ? 'active' : 'none'}</small></div>
                </div>
                <div className={styles.cardFooter}>
                  <a href={`https://testnet.arcscan.app/address/${pool.pair}`} target="_blank" rel="noreferrer">View pool ↗</a>
                  <div><button onClick={() => openAdd(pool)}>Add</button>{pool.hasPosition && <button className={styles.secondaryAction} onClick={() => openRemove(pool)}>Remove</button>}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className={styles.bottomNote}>
        <span>Direct on-chain UnitFlow integration</span>
        <span>Factory · Liquidity Router · LP tokens</span>
      </div>

      {action && (
        <div className={styles.overlay} onMouseDown={(event) => event.target === event.currentTarget && closePanel()}>
          <div className={styles.drawer}>
            <div className={styles.drawerHead}><div><div className={styles.eyebrow}>UNITFLOW V2.5</div><h2>{action === 'create' ? 'Create a pool' : action === 'remove' ? `Exit ${poolLabel(selectedPool)}` : `Add to ${selectedPool ? poolLabel(selectedPool) : 'a pool'}`}</h2></div><button onClick={closePanel}>×</button></div>

            {action === 'create' && (
              <>
                <p className={styles.drawerCopy}>Create the pair on UnitFlow's Factory. After that, seed the opening liquidity to establish the starting price.</p>
                <label>Token A<input value={createA} onChange={(e) => setCreateA(e.target.value)} placeholder="0x…" /></label>
                <label>Token B<input value={createB} onChange={(e) => setCreateB(e.target.value)} placeholder="0x…" /></label>
                <div className={styles.helper}>Use ERC-20 addresses on Arc Testnet. The pair is created directly on UnitFlow.</div>
                <button className={styles.bigAction} disabled={!isConnected || !createA || !createB || isPending} onClick={submitCreate}>{!isConnected ? 'Connect wallet' : isPending ? 'Waiting for wallet…' : 'Create pool'}</button>
              </>
            )}

            {action === 'add' && (
              <>
                <div className={styles.routeStrip}><span>PAIR</span><strong>{selectedPool ? poolLabel(selectedPool) : 'Custom pair'}</strong><span>V2.5</span></div>
                {!selectedPool && <><label>Token A<input value={tokenA} onChange={(e) => setTokenA(createToken(e.target.value))} placeholder="0x…" /></label><label>Token B<input value={tokenB} onChange={(e) => setTokenB(createToken(e.target.value))} placeholder="0x…" /></label></>}
                <label>Amount A<input value={amountA} onChange={(e) => setAmountA(e.target.value)} placeholder="0.00" inputMode="decimal" /></label>
                <label>Amount B<input value={amountB} onChange={(e) => setAmountB(e.target.value)} placeholder="0.00" inputMode="decimal" /></label>
                <div className={styles.helper}>For existing pools, enter the current ratio. UnitFlow's router enforces the pool ratio on-chain. USDC pairs use UnitFlow's native-USDC liquidity path.</div>
                <button className={styles.bigAction} disabled={!isConnected || !tokenA || !tokenB || !amountA || !amountB || isPending} onClick={submitAdd}>{!isConnected ? 'Connect wallet' : isPending ? 'Confirming…' : 'Approve & add liquidity'}</button>
              </>
            )}

            {action === 'remove' && selectedPool && (
              <>
                <div className={styles.positionBox}><span>Your LP balance</span><strong>{formatUnitsSafe(pairReads?.[2]?.result || selectedPool.lpBalance, 18, 8)}</strong><small>LP tokens</small></div>
                <div className={styles.helper}>The current MVP removes your full active LP balance. UnitFlow burns the LP tokens and returns the underlying reserves to your wallet.</div>
                <button className={styles.bigAction} disabled={!isConnected || !pairReads?.[2]?.result || pairReads?.[2]?.result === 0n || isPending} onClick={submitRemove}>{!isConnected ? 'Connect wallet' : isPending ? 'Confirming…' : 'Approve & remove liquidity'}</button>
              </>
            )}

            {notice && <div className={styles.drawerNotice}>{notice}</div>}
            {error && <div className={styles.drawerError}>{error}</div>}
            {writeHash && <a className={styles.txLink} href={`https://testnet.arcscan.app/tx/${writeHash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
          </div>
        </div>
      )}
    </div>
  );
}
