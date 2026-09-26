import { NextResponse } from 'next/server';
import { CENTRY_AGENT_SYSTEM_PROMPT, CENTRY_KNOWLEDGE_BASE, fallbackPositionAnswer } from '../../../lib/agentContext';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../lib/rateLimit';
import { SWAP_MARKETS } from '../../../constants/markets';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

const ACTIONS = Object.freeze({
  supply: 'lending.supply',
  withdraw: 'lending.withdraw',
  borrow: 'lending.borrow',
  repay: 'lending.repay',
  lock: 'governance.createLock',
  increaseLock: 'governance.increaseLock',
  extendLock: 'governance.extendLock',
  withdrawLock: 'governance.withdrawLock',
  reward: 'rewards.claim',
  swap: 'swap',
  bridge: 'bridge',
  gateway: 'gateway.fund',
});

const MARKET_REFERENCE = SWAP_MARKETS
  .filter((market) => market.address)
  .map((market) => ({
    id: market.id,
    symbol: market.symbol,
    decimals: market.decimals,
    address: market.address,
    status: market.status,
  }));

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function marketBySymbol(symbol, context) {
  const requested = String(symbol || context?.market || 'USDC').toLowerCase();
  return (
    MARKET_REFERENCE.find(
      (market) =>
        market.symbol.toLowerCase() === requested ||
        market.id.toLowerCase() === requested,
    ) || MARKET_REFERENCE.find((market) => market.symbol === 'USDC')
  );
}

function parseExplicitExecution(question, context) {
  const text = question.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();

  let match = text.match(/\b(borrow|supply|deposit|withdraw|repay)\s+(\d+(?:\.\d+)?)\s*(usdc|eurc|cirbtc|cent)?\b/);
  if (match) {
    const kind = match[1] === 'deposit' ? 'supply' : match[1];
    const market = marketBySymbol(match[3], context);
    const amount = parseNumber(match[2]);
    if (amount && market) {
      const label = `${kind[0].toUpperCase()}${kind.slice(1)}`;
      const actions = kind === 'supply' || kind === 'repay'
        ? buildLendingActions({ kind, market, amount, context })
        : [{ type: ACTIONS[kind], asset: market.address, assetSymbol: market.symbol, decimals: market.decimals, amount: String(amount) }];
      return { answer: `${label} ${amount} ${market.symbol} on Arc. Opening the wallet signature now.`, plan: { title: `${label} ${market.symbol}`, reason: 'Explicit transaction request.', autoExecute: true, actions } };
    }
  }

  match = text.match(/\bswap\s+(\d+(?:\.\d+)?)\s*(usdc|eurc|cirbtc|cent)\s+(?:to|for)\s+(usdc|eurc|cirbtc|cent)\b/);
  if (match) {
    const input = marketBySymbol(match[2], context);
    const output = marketBySymbol(match[3], context);
    const amount = parseNumber(match[1]);
    if (amount && input?.address && output?.address) {
      const raw = (() => { try { return BigInt(Math.round(amount * 10 ** input.decimals)).toString(); } catch { return null; } })();
      if (raw) return { answer: `Swap ${amount} ${input.symbol} to ${output.symbol}. Opening the wallet signature now.`, plan: { title: `Swap ${input.symbol} → ${output.symbol}`, reason: 'Explicit swap request.', autoExecute: true, actions: [{ type: ACTIONS.swap, inputToken: input.address, outputToken: output.address, inputDecimals: input.decimals, inputSymbol: input.symbol, outputSymbol: output.symbol, amount: String(amount), amountRaw: raw, slippage: 0.5 }] } };
    }
  }

  match = text.match(/\bbridge\s+(\d+(?:\.\d+)?)\s*usdc\s+(?:from\s+)?(arc|base|arbitrum|ethereum)\s+(?:to|→)\s+(arc|base|arbitrum|ethereum)\b/);
  if (match && match[2] !== match[3]) {
    const amount = parseNumber(match[1]);
    if (amount) return { answer: `Bridge ${amount} USDC from ${match[2]} to ${match[3]}. Opening the wallet signature now.`, plan: { title: 'Bridge USDC', reason: 'Explicit bridge request.', autoExecute: true, actions: [{ type: ACTIONS.bridge, fromChain: match[2], toChain: match[3], amount: String(amount) }] } };
  }

  if (/^bridge\b/.test(text)) {
    return { answer: 'Tell me the source and destination, for example: “bridge 10 USDC from Base to Arc”.', plan: null };
  }

  return null;
}

const EXECUTION_SCHEMA = `Return JSON only. For a transaction request, return {"answer":"...","plan":{"title":"...","reason":"...","autoExecute":false,"actions":[...]}}.

Only these assistant transaction actions are allowed:
- lending.supply
- lending.withdraw
- lending.borrow
- lending.repay
- swap
- bridge

The assistant never executes silently. Always set autoExecute=false so the user sees the transaction preview and must sign in their wallet.

Never expose or generate arbitrary calldata, contract addresses, token addresses, recipients, private keys, API keys, proofs, hashes, or hidden parameters. Never create/change permissions, ownership, agent activation, governance state, or reward claims from chat. Governance and rewards can be explained, but are not executable from this assistant while those controls are disabled.

Supported lending assets must come from the configured Centry markets. Bridge routes are limited to arc, base, arbitrum, ethereum and are USDC-only. Swap assets must come from configured Centry markets and the existing swap infrastructure; never invent a route or quote.

Read-only questions must return plan:null. A transaction plan requires explicit state-changing intent. Never infer intent from topic words alone. Do not warn about liquidation unless the supplied health factor is below 1.0.
`;

function buildPrompt({ question, context }) {
  return `${CENTRY_AGENT_SYSTEM_PROMPT}\n\n${EXECUTION_SCHEMA}\n\nVERIFIED CENTRY REFERENCE:\n${CENTRY_KNOWLEDGE_BASE}\n\nMARKETS:\n${JSON.stringify(MARKET_REFERENCE)}\n\nPOSITION:\n${JSON.stringify(context, null, 2)}\n\nREQUEST:\n${question}`;
}

function parseModelJson(text) {
  try {
    return JSON.parse(String(text || '').trim());
  } catch {
    return null;
  }
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.actions) || !plan.actions.length) return null;

  const allowed = new Set([
    ACTIONS.supply,
    ACTIONS.withdraw,
    ACTIONS.borrow,
    ACTIONS.repay,
    ACTIONS.swap,
    ACTIONS.bridge,
  ]);

  const actions = plan.actions.slice(0, 4).filter((action) => {
    if (!action || typeof action !== 'object' || !allowed.has(action.type)) return false;
    if ([ACTIONS.supply, ACTIONS.withdraw, ACTIONS.borrow, ACTIONS.repay].includes(action.type)) {
      return Boolean(
        action.asset &&
        MARKET_REFERENCE.some((market) => String(market.address).toLowerCase() === String(action.asset).toLowerCase()) &&
        parseNumber(action.amount)
      );
    }
    if (action.type === ACTIONS.swap) {
      return Boolean(
        action.inputToken &&
        action.outputToken &&
        MARKET_REFERENCE.some((market) => String(market.address).toLowerCase() === String(action.inputToken).toLowerCase()) &&
        MARKET_REFERENCE.some((market) => String(market.address).toLowerCase() === String(action.outputToken).toLowerCase()) &&
        parseNumber(action.amount) &&
        String(action.amountRaw || '').match(/^\d+$/)
      );
    }
    if (action.type === ACTIONS.bridge) {
      const from = String(action.fromChain || '').toLowerCase();
      const to = String(action.toChain || '').toLowerCase();
      return from !== to &&
        ['arc', 'base', 'arbitrum', 'ethereum'].includes(from) &&
        ['arc', 'base', 'arbitrum', 'ethereum'].includes(to) &&
        parseNumber(action.amount);
    }
    return false;
  });

  if (!actions.length) return null;

  return {
    title: cleanText(plan.title || 'Centry transaction', 120),
    reason: cleanText(plan.reason || 'Explicit transaction request.', 240),
    autoExecute: false,
    actions,
  };
}

export async function POST(request) {
  const limit = rateLimit(request, 'assistant', { max: 12, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const body = await request.json();
    const question = cleanText(body?.question, 500);
    const context = body?.context && typeof body.context === 'object' ? body.context : {};
    if (!question) return withRateLimitHeaders(NextResponse.json({ success: false, error: 'Ask a question about Centry.' }, { status: 400 }), limit);

    const explicit = parseExplicitExecution(question, context);
    if (explicit) {
      return withRateLimitHeaders(NextResponse.json({
        success: true,
        ...explicit,
        plan: explicit.plan ? { ...explicit.plan, autoExecute: false } : null,
        provider: 'deterministic',
      }), limit);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return withRateLimitHeaders(NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback' }), limit);
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: CENTRY_AGENT_SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: buildPrompt({ question, context }) }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 700 } }), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return withRateLimitHeaders(NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback', warning: 'AI provider unavailable.' }), limit);
    const rawModelText = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('');
    const parsed = parseModelJson(rawModelText);
    if (!parsed) return withRateLimitHeaders(NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: model }), limit);
    const safePlan = normalizePlan(parsed.plan);
    return withRateLimitHeaders(NextResponse.json({
      success: true,
      answer: parsed.answer || fallbackPositionAnswer(context, question),
      plan: safePlan,
      provider: model,
    }), limit);
  } catch (error) {
    return withRateLimitHeaders(NextResponse.json({ success: false, error: error?.message || 'Centrion is temporarily unavailable.' }, { status: 500 }), limit);
  }
}
