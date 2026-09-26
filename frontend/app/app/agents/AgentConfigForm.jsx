'use client';

import { useEffect, useState } from 'react';
import styles from './agents.module.css';
import {
  AGENT_ACTION_OPTIONS,
  AGENT_ASSET_OPTIONS,
  API_BASE,
  defaultAgentConfig,
} from './agentClient';

function cleanIncomingConfig(agent) {
  const base = defaultAgentConfig();
  const autonomy = agent?.config?.autonomy || {};
  const policy = agent?.config?.policy || {};
  return {
    ...base,
    name: agent?.name || '',
    description: agent?.description || '',
    provider: autonomy.provider || '',
    model: '',
    providerKey: '',
    autonomy: {
      enabled: autonomy.enabled !== false,
      instructions: autonomy.instructions || '',
      maxActions: Number(autonomy.maxActions || 4),
      slippageBps: Number(autonomy.slippageBps ?? 50),
      riskGuard: {
        enabled: autonomy.riskGuard?.enabled === true,
        minHealthFactor: String(autonomy.riskGuard?.minHealthFactor || '1.50'),
        repayAtHealthFactor: String(autonomy.riskGuard?.repayAtHealthFactor || '1.65'),
        stopBorrowAtHealthFactor: String(autonomy.riskGuard?.stopBorrowAtHealthFactor || '1.80'),
      },
    },
    policy: {
      allowedActions: Array.isArray(policy.allowedActions) && policy.allowedActions.length ? policy.allowedActions : base.policy.allowedActions,
      allowedAssets: Array.isArray(policy.allowedAssets) && policy.allowedAssets.length ? policy.allowedAssets : base.policy.allowedAssets,
      maxAmountByAsset: {
        USDC: String(policy.maxAmountByAsset?.USDC || ''),
        EURC: String(policy.maxAmountByAsset?.EURC || ''),
        CIRBTC: String(policy.maxAmountByAsset?.CIRBTC || ''),
        CENT: String(policy.maxAmountByAsset?.CENT || ''),
      },
    },
  };
}

export function AgentConfigForm({ mode = 'create', agent = null, onSubmit, submitting = false, submitLabel }) {
  const [form, setForm] = useState(() => mode === 'edit' ? cleanIncomingConfig(agent) : defaultAgentConfig());
  const [configuredProviders, setConfiguredProviders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(mode === 'edit' ? cleanIncomingConfig(agent) : defaultAgentConfig());
  }, [mode, agent?.account]);

  useEffect(() => {
    if (mode !== 'edit' || !agent?.id || !API_BASE) return;
    apiLoadProviders(agent.id)
      .then((providers) => {
        setConfiguredProviders(providers);
        const currentProvider = providers.find((item) => item.provider === form.provider);
        if (currentProvider?.model) {
          setForm((current) => ({ ...current, model: currentProvider.model }));
        }
      })
      .catch(() => setConfiguredProviders([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, agent?.id]);

  async function apiLoadProviders(agentId) {
    const response = await fetch(`${API_BASE}/api/v1/agents/${agentId}/providers`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || 'Unable to load providers');
    return body.providers || [];
  }

  function update(path, value) {
    setForm((current) => {
      if (path === 'provider' || path === 'model' || path === 'providerKey' || path === 'name' || path === 'description') {
        return { ...current, [path]: value };
      }
      return {
        ...current,
        autonomy: path.startsWith('autonomy.')
          ? path.startsWith('autonomy.riskGuard.')
            ? { ...current.autonomy, riskGuard: { ...current.autonomy.riskGuard, [path.slice('autonomy.riskGuard.'.length)]: value } }
            : { ...current.autonomy, [path.slice(9)]: value }
          : current.autonomy,
      };
    });
  }

  function toggleAction(value) {
    setForm((current) => ({
      ...current,
      policy: {
        ...current.policy,
        allowedActions: current.policy.allowedActions.includes(value)
          ? current.policy.allowedActions.filter((item) => item !== value)
          : [...current.policy.allowedActions, value],
      },
    }));
  }

  function toggleAsset(value) {
    setForm((current) => ({
      ...current,
      policy: {
        ...current.policy,
        allowedAssets: current.policy.allowedAssets.includes(value)
          ? current.policy.allowedAssets.filter((item) => item !== value)
          : [...current.policy.allowedAssets, value],
      },
    }));
  }

  function updateCap(asset, value) {
    setForm((current) => ({
      ...current,
      policy: {
        ...current.policy,
        maxAmountByAsset: { ...current.policy.maxAmountByAsset, [asset]: value },
      },
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    if (!form.policy.allowedActions.length) return setError('Select at least one allowed action.');
    if (!form.policy.allowedAssets.length) return setError('Select at least one allowed asset.');
    if (!form.name.trim() && mode === 'create') return setError('Give your agent a name.');
    const providerParts = [form.provider.trim(), form.model.trim(), form.providerKey.trim()].filter(Boolean).length;
    if (providerParts > 0 && providerParts < 3) return setError('To configure an AI provider now, enter the provider, model, and API key together. Otherwise leave all three blank.');

    if (form.autonomy.riskGuard?.enabled) {
      const minHealth = Number(form.autonomy.riskGuard.minHealthFactor);
      const repayAt = Number(form.autonomy.riskGuard.repayAtHealthFactor);
      const stopBorrowAt = Number(form.autonomy.riskGuard.stopBorrowAtHealthFactor);
      if (![minHealth, repayAt, stopBorrowAt].every((value) => Number.isFinite(value) && value > 0)) {
        return setError('Enter positive health-factor thresholds for position protection.');
      }
      if (!(minHealth <= repayAt && repayAt <= stopBorrowAt)) {
        return setError('Protection thresholds must be ordered: minimum ≤ repay below ≤ block borrow below.');
      }
    }

    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model.trim(),
        providerKey: form.providerKey.trim(),
        autonomy: {
          ...form.autonomy,
          maxActions: Math.min(4, Math.max(1, Number(form.autonomy.maxActions || 4))),
          slippageBps: Math.min(5000, Math.max(0, Number(form.autonomy.slippageBps || 0))),
          riskGuard: {
            enabled: form.autonomy.riskGuard?.enabled === true,
            minHealthFactor: String(form.autonomy.riskGuard?.minHealthFactor || '1.50').trim(),
            repayAtHealthFactor: String(form.autonomy.riskGuard?.repayAtHealthFactor || '1.65').trim(),
            stopBorrowAtHealthFactor: String(form.autonomy.riskGuard?.stopBorrowAtHealthFactor || '1.80').trim(),
          },
        },
        policy: {
          ...form.policy,
          maxAmountByAsset: Object.fromEntries(
            Object.entries(form.policy.maxAmountByAsset).filter(([, value]) => String(value || '').trim()),
          ),
        },
      });
    } catch (e) {
      setError(e?.message || 'Configuration could not be saved.');
    }
  }

  const actionCount = form.policy.allowedActions.length;
  const assetCount = form.policy.allowedAssets.length;
  const isCreate = mode === 'create';

  return (
    <form className={styles.configForm} onSubmit={submit}>
      {isCreate ? (
        <section className={styles.configPanel}>
          <div className={styles.sectionHead}>
            <div>
              <h2>Identity</h2>
              <p>Give the agent a name and tell it what it is responsible for.</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.label}>Agent name</label>
              <input className={styles.input} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Treasury agent" maxLength={64} />
            </div>
            <div>
              <label className={styles.label}>Description</label>
              <input className={styles.input} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="What should this agent manage?" maxLength={180} />
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.configPanel}>
        <div className={styles.sectionHead}>
          <div>
            <h2>AI provider</h2>
            <p>Choose the model that reasons for this agent. Provider credentials are encrypted server-side.</p>
          </div>
        </div>
        <div className={styles.formGrid}>
          <div>
            <label className={styles.label}>Provider <span className={styles.hint}>optional</span></label>
            <input className={styles.input} value={form.provider} onChange={(e) => update('provider', e.target.value)} placeholder="Provider identifier, if you want to configure one now" />
          </div>
          <div>
            <label className={styles.label}>Model <span className={styles.hint}>optional</span></label>
            <input className={styles.input} value={form.model} onChange={(e) => update('model', e.target.value)} placeholder="e.g. gemini-3.1-flash-lite" />
          </div>
        </div>
        <label className={styles.label}>Provider API key{isCreate ? ' · optional' : ' · leave blank to keep the current key'}</label>
        <input className={styles.input} type="password" value={form.providerKey} onChange={(e) => update('providerKey', e.target.value)} placeholder={isCreate ? 'Paste your provider API key' : 'Enter a new key only when rotating it'} />
        {!isCreate && (
          <p className={styles.hint}>{configuredProviders.length ? `Configured: ${configuredProviders.map((item) => item.provider + ' · ' + item.model).join(', ')}` : 'No provider metadata is currently returned for this agent.'}</p>
        )}
      </section>

      <section className={styles.configPanel}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Behavior</h2>
            <p>Define the strategy, autonomy and execution guardrails before the agent is created.</p>
          </div>
        </div>
        <label className={styles.scope}>
          <input type="checkbox" checked={form.autonomy.enabled} onChange={(e) => update('autonomy.enabled', e.target.checked)} />
          <span><strong>Allow autonomous runs</strong><small>When OFF, the hosted runner can be configured but will not execute AI-driven work.</small></span>
        </label>
        <label className={styles.label}>Strategy / instructions</label>
        <textarea className={styles.textarea} rows={7} value={form.autonomy.instructions} onChange={(e) => update('autonomy.instructions', e.target.value)} placeholder="Example: supply idle USDC, never borrow, preserve enough native USDC for gas, and only swap CENT when the stated condition is met." />
        <div className={styles.riskGuardPanel}>
          <div className={styles.sectionHead}>
            <div>
              <h3>Position protection</h3>
              <p>Deterministic guardrails evaluated from the live lending-pool health factor before the AI can execute actions.</p>
            </div>
          </div>

          <label className={styles.scope}>
            <input type="checkbox" checked={form.autonomy.riskGuard?.enabled === true} onChange={(e) => update('autonomy.riskGuard.enabled', e.target.checked)} />
            <span><strong>Enable health-factor protection</strong><small>Blocks new borrowing below the configured threshold and can repay debt from matching assets held by the agent.</small></span>
          </label>

          <div className={styles.formGrid}>
            <div>
              <label className={styles.label}>Minimum health factor</label>
              <input className={styles.input} inputMode="decimal" value={form.autonomy.riskGuard?.minHealthFactor || '1.50'} onChange={(e) => update('autonomy.riskGuard.minHealthFactor', e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Repay below</label>
              <input className={styles.input} inputMode="decimal" value={form.autonomy.riskGuard?.repayAtHealthFactor || '1.65'} onChange={(e) => update('autonomy.riskGuard.repayAtHealthFactor', e.target.value)} />
            </div>
            <div>
              <label className={styles.label}>Block borrow below</label>
              <input className={styles.input} inputMode="decimal" value={form.autonomy.riskGuard?.stopBorrowAtHealthFactor || '1.80'} onChange={(e) => update('autonomy.riskGuard.stopBorrowAtHealthFactor', e.target.value)} />
            </div>
          </div>
        </div>

        <div className={styles.formGrid}>
          <div>
            <label className={styles.label}>Max actions per run</label>
            <input className={styles.input} inputMode="numeric" min="1" max="4" value={form.autonomy.maxActions} onChange={(e) => update('autonomy.maxActions', e.target.value)} />
          </div>
          <div>
            <label className={styles.label}>Swap slippage (bps)</label>
            <input className={styles.input} inputMode="numeric" min="0" max="5000" value={form.autonomy.slippageBps} onChange={(e) => update('autonomy.slippageBps', e.target.value)} />
          </div>
        </div>
      </section>

      <section className={styles.configPanel}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Permissions</h2>
            <p>Select exactly what the agent may attempt. Token approvals are treated as prerequisites, not as separate behavior.</p>
          </div>
        </div>
        <div className={styles.configSummary}><span>{actionCount} actions</span><span>{assetCount} assets</span></div>
        <div className={styles.scopeGrid}>
          {AGENT_ACTION_OPTIONS.map(([value, label, description]) => (
            <label key={value} className={styles.scope}>
              <input type="checkbox" checked={form.policy.allowedActions.includes(value)} onChange={() => toggleAction(value)} />
              <span><strong>{label}</strong><small>{description}</small></span>
            </label>
          ))}
        </div>
        <label className={styles.label}>Allowed assets</label>
        <div className={styles.scopeGrid}>
          {AGENT_ASSET_OPTIONS.map(([value, label]) => (
            <label key={value} className={styles.scope}>
              <input type="checkbox" checked={form.policy.allowedAssets.includes(value)} onChange={() => toggleAsset(value)} />
              <span><strong>{label}</strong><small>May be used by the selected actions.</small></span>
            </label>
          ))}
        </div>
        <label className={styles.label}>Maximum amount per action</label>
        <div className={styles.formGrid}>
          {AGENT_ASSET_OPTIONS.map(([value, label]) => (
            <div key={value}>
              <label className={styles.label}>{label}</label>
              <input className={styles.input} inputMode="decimal" value={form.policy.maxAmountByAsset[value] || ''} onChange={(e) => updateCap(value, e.target.value)} placeholder={value === 'CIRBTC' ? 'e.g. 0.01' : value === 'CENT' ? 'e.g. 1000' : 'Leave blank for no cap'} />
            </div>
          ))}
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.configFooter}>
        <div>
          <strong>{isCreate ? 'Everything is ready?' : 'Save your changes'}</strong>
          <p>{isCreate ? 'The smart-account transaction happens only after you confirm this configuration.' : 'Backend configuration changes are signed by your wallet; no owner private key is shared.'}</p>
        </div>
        <button className={styles.primaryButton} disabled={submitting} type="submit">
          {submitting ? 'Saving…' : submitLabel || (isCreate ? 'Create agent' : 'Save configuration')}
        </button>
      </div>
    </form>
  );
}
