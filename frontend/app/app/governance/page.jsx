'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import { useVeGovernance } from '../../../hooks/useVeGovernance';
import { CONTRACT_ADDRESSES } from '../../../constants/contracts';
import { VE_CENTRY_ABI } from '../../../constants/abis';

const WEEK = 7 * 24 * 60 * 60;
const CREATE_DURATIONS = [4, 13, 26, 52];
const EXTEND_DURATIONS = [13, 26, 52, 78, 104];

function formatCENT(value) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(Number(value) * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function remainingWeeks(lockEnd) {
  if (!lockEnd) return 0;
  return Math.max(0, Math.ceil((Number(lockEnd) * 1000 - Date.now()) / (WEEK * 1000)));
}

function DurationPicker({ value, options, onChange, label }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = Number(value);

  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  return (
    <div className={`duration-picker${open ? ' duration-picker-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="duration-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span>{selected} weeks</span>
        <span className="duration-chevron">{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className="duration-menu" role="listbox" aria-label={label}>
          {options.map((weeks) => (
            <button
              key={weeks}
              type="button"
              role="option"
              aria-selected={weeks === selected}
              className={`duration-option${weeks === selected ? ' duration-option-active' : ''}`}
              onClick={() => {
                onChange(String(weeks));
                setOpen(false);
              }}
            >
              <span>{weeks} weeks</span>
              {weeks === selected ? <span className="duration-check">✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Providers><AppShell><GovernanceContent /></AppShell></Providers>;
}

function GovernanceContent() {
  const { isConnected } = useAccount();
  const governance = useVeGovernance();
  const [amount, setAmount] = useState('');
  const [weeks, setWeeks] = useState('52');
  const [notice, setNotice] = useState('');
  const [positionAmount, setPositionAmount] = useState({});
  const [positionWeeks, setPositionWeeks] = useState({});
  const [busyPosition, setBusyPosition] = useState(null);

  const busy = governance.isPending || governance.isConfirming;
  const needsApproval = isConnected && Number(amount || 0) > Number(governance.centAllowance || 0);

  const tokenIds = governance.tokenIds || [];
  const positionContracts = useMemo(
    () => tokenIds.flatMap((tokenId) => [
      {
        address: CONTRACT_ADDRESSES.veCentry,
        abi: VE_CENTRY_ABI,
        functionName: 'lockedAmount',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACT_ADDRESSES.veCentry,
        abi: VE_CENTRY_ABI,
        functionName: 'lockEnd',
        args: [BigInt(tokenId)],
      },
      {
        address: CONTRACT_ADDRESSES.veCentry,
        abi: VE_CENTRY_ABI,
        functionName: 'votingPower',
        args: [BigInt(tokenId)],
      },
    ]),
    [tokenIds],
  );

  const { data: positionData } = useReadContracts({
    contracts: positionContracts,
    query: { enabled: isConnected && tokenIds.length > 0 },
  });

  const positions = tokenIds.map((tokenId, index) => {
    const base = index * 3;
    const locked = positionData?.[base]?.result ?? 0n;
    const end = positionData?.[base + 1]?.result ?? 0n;
    const power = positionData?.[base + 2]?.result ?? 0n;
    return {
      tokenId,
      locked: formatUnits(locked, 18),
      end: Number(end),
      power: formatUnits(power, 18),
      weeksLeft: remainingWeeks(end),
    };
  });

  const submit = async () => {
    if (!isConnected || !amount || Number(amount) <= 0 || busy) return;
    try {
      setNotice('');
      if (needsApproval) {
        await governance.approveCENT(amount);
        setNotice(`Approved ${amount} CENT.`);
        return;
      }
      await governance.createLock(amount, weeks);
      await governance.refetchAll();
      setAmount('');
      setNotice('CENT lock confirmed onchain.');
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Transaction failed.');
    }
  };

  const increasePosition = async (tokenId) => {
    const value = positionAmount[tokenId];
    if (!value || Number(value) <= 0 || busyPosition) return;
    try {
      setNotice('');
      setBusyPosition(`increase-${tokenId}`);
      const allowance = Number(governance.centAllowance || 0);
      if (Number(value) > allowance) {
        await governance.approveCENT(value);
        setNotice(`Approved ${value} CENT. Press Add CENT again to complete the increase.`);
        return;
      }
      await governance.increaseLock(BigInt(tokenId), value);
      await governance.refetchAll();
      setPositionAmount((current) => ({ ...current, [tokenId]: '' }));
      setNotice(`Added ${value} CENT to veCENT #${tokenId}.`);
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Transaction failed.');
    } finally {
      setBusyPosition(null);
    }
  };

  const extendPosition = async (tokenId, currentWeeks) => {
    const targetWeeks = Number(positionWeeks[tokenId] || 52);
    if (!targetWeeks || targetWeeks <= currentWeeks || busyPosition) {
      setNotice(`Choose a duration longer than the current ${currentWeeks}-week remaining lock.`);
      return;
    }
    try {
      setNotice('');
      setBusyPosition(`extend-${tokenId}`);
      await governance.extendLock(BigInt(tokenId), targetWeeks);
      await governance.refetchAll();
      setNotice(`veCENT #${tokenId} extended to ${targetWeeks} weeks.`);
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Transaction failed.');
    } finally {
      setBusyPosition(null);
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header governance-header">
        <div>
          <span className="section-kicker">GOVERNANCE</span>
          <h1>veCENT</h1>
          <p>Lock CENT to create and manage your governance positions.</p>
        </div>
      </div>

      <section className="governance-hero-grid">
        <div className="panel governance-hero-card">
          <span className="section-kicker">YOUR POSITION</span>
          <div className="big-number">{isConnected ? formatCENT(governance.votingPower) : '—'}</div>
          <span className="muted-label">Voting power</span>
          <div className="governance-stat-line"><span>CENT balance</span><strong>{isConnected ? formatCENT(governance.centBalance) : '—'}</strong></div>
          <div className="governance-stat-line"><span>Locked CENT</span><strong>{isConnected ? formatCENT(governance.lockedAmount) : '—'}</strong></div>
          <div className="governance-stat-line"><span>veNFTs</span><strong>{isConnected ? governance.veBalance : '—'}</strong></div>
          <div className="governance-stat-line"><span>Primary lock end</span><strong>{isConnected ? formatDate(governance.lockEnd / 1000) : '—'}</strong></div>
        </div>

        <div className="panel">
          <span className="section-kicker">CREATE POSITION</span>
          <h2>Lock CENT</h2>
          <p className="panel-copy">Longer locks create more voting power. Each lock is represented by its own veCENT position.</p>
          <label className="field-label" htmlFor="cent-amount">CENT amount</label>
          <div className="amount-input-wrap"><input id="cent-amount" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>CENT</span></div>
          <label className="field-label" htmlFor="lock-weeks">Lock duration</label>
          <DurationPicker value={weeks} options={CREATE_DURATIONS} onChange={setWeeks} label="Lock duration" />
          {!isConnected ? <div className="connect-prompt">Connect your wallet to manage veCENT.</div> : <button type="button" className="primary-btn full-btn large-btn" disabled={busy || !amount} onClick={submit}>{busy ? 'Waiting for confirmation…' : needsApproval ? 'Approve CENT' : `Lock CENT for ${weeks} weeks`}</button>}
          {notice && <div className="notice">{notice}</div>}
        </div>
      </section>

      {isConnected && positions.length > 0 ? (
        <section className="panel governance-positions-panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">POSITIONS</span>
              <h2>Your veCENT locks</h2>
            </div>
            <span className="position-count">{positions.length} position{positions.length === 1 ? '' : 's'}</span>
          </div>

          <div className="governance-position-list">
            {positions.map((position) => {
              const adding = busyPosition === `increase-${position.tokenId}` || busy;
              const extending = busyPosition === `extend-${position.tokenId}` || busy;
              const selectedWeeks = Number(positionWeeks[position.tokenId] || 52);
              return (
                <article className="governance-position-card" key={position.tokenId}>
                  <div className="position-topline">
                    <div>
                      <strong>veCENT #{position.tokenId}</strong>
                      <span>{position.weeksLeft > 0 ? `${position.weeksLeft} weeks remaining` : 'Lock expired'}</span>
                    </div>
                    <div className="position-power"><strong>{formatCENT(position.power)}</strong><span>voting power</span></div>
                  </div>

                  <div className="position-detail-grid">
                    <div><span>Locked</span><strong>{formatCENT(position.locked)} CENT</strong></div>
                    <div><span>Unlocks</span><strong>{formatDate(position.end)}</strong></div>
                  </div>

                  <div className="position-actions-grid">
                    <div className="position-action-block">
                      <label className="field-label" htmlFor={`add-${position.tokenId}`}>Add CENT</label>
                      <div className="amount-input-wrap"><input id={`add-${position.tokenId}`} type="number" min="0" step="0.01" placeholder="0.00" value={positionAmount[position.tokenId] || ''} onChange={(event) => setPositionAmount((current) => ({ ...current, [position.tokenId]: event.target.value }))} /><span>CENT</span></div>
                      <button type="button" className="secondary-btn full-btn" disabled={adding || !positionAmount[position.tokenId]} onClick={() => increasePosition(position.tokenId)}>{adding ? 'Working…' : 'Add CENT'}</button>
                    </div>

                    <div className="position-action-block">
                      <label className="field-label">Extend lock</label>
                      <DurationPicker value={String(selectedWeeks)} options={EXTEND_DURATIONS} onChange={(value) => setPositionWeeks((current) => ({ ...current, [position.tokenId]: value }))} label={`Extend veCENT #${position.tokenId}`} />
                      <button type="button" className="secondary-btn full-btn" disabled={extending} onClick={() => extendPosition(position.tokenId, position.weeksLeft)}>{extending ? 'Working…' : `Extend to ${selectedWeeks} weeks`}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <style jsx global>{`
        .governance-header{align-items:flex-start}
        .governance-positions-panel{margin-top:2px}
        .position-count{color:#8f849d;font-size:11px}
        .governance-position-list{display:grid;gap:12px}
        .governance-position-card{padding:18px;border:1px solid #2d233b;border-radius:14px;background:rgba(13,9,21,.72)}
        .position-topline{display:flex;justify-content:space-between;gap:20px;align-items:center}
        .position-topline strong{display:block;font-size:15px}
        .position-topline span,.position-power span{display:block;margin-top:4px;color:#8f849d;font-size:11px}
        .position-power{text-align:right}.position-power strong{font-size:18px}
        .position-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:16px}
        .position-detail-grid>div{padding:12px;border:1px solid #2a2235;border-radius:10px;background:rgba(11,8,18,.48)}
        .position-detail-grid span{display:block;color:#8f849d;font-size:11px}.position-detail-grid strong{display:block;margin-top:5px;font-size:13px}
        .position-actions-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
        .position-action-block{display:grid;gap:8px}.position-action-block .field-label{margin-top:0}
        .secondary-btn{border:1px solid #3a3047;background:#14101d;color:#e7ddf2;border-radius:10px;padding:11px 14px;font-weight:700;cursor:pointer}.secondary-btn:hover{border-color:#66567d;background:#1a1424}.secondary-btn:disabled{opacity:.48;cursor:not-allowed}
        .duration-picker{position:relative;z-index:1;min-width:0}
        .duration-picker-open{z-index:30}
        .duration-trigger{display:flex;width:100%;min-height:44px;align-items:center;justify-content:space-between;gap:10px;padding:0 13px;border:1px solid var(--line);border-radius:11px;background:#0b0712;color:var(--text);text-align:left;cursor:pointer}
        .duration-trigger:hover,.duration-picker-open .duration-trigger{border-color:var(--purple-3);box-shadow:0 0 0 3px #9b62ff18}
        .duration-chevron{color:#9c8bac;font-size:12px}
        .duration-menu{position:absolute;z-index:100;top:calc(100% + 8px);left:0;right:0;display:grid;gap:4px;padding:7px;border:1px solid #3a2a4f;border-radius:14px;background:rgba(11,8,19,.99);box-shadow:0 24px 60px rgba(0,0,0,.58),0 0 0 1px rgba(155,98,255,.04);backdrop-filter:blur(14px)}
        .duration-option{display:flex;width:100%;min-height:42px;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid transparent;border-radius:10px;background:transparent;color:#e9e2f2;text-align:left;cursor:pointer}
        .duration-option:hover,.duration-option-active{border-color:#382a4a;background:linear-gradient(120deg,#171022,#120c1b)}
        .duration-check{color:#b38aff;font-weight:800}
        @media (max-width:700px){.position-actions-grid,.position-detail-grid{grid-template-columns:1fr}.position-topline{align-items:flex-start;flex-direction:column}.position-power{text-align:left}}
      `}</style>
    </div>
  );
}
