import { NextResponse } from 'next/server';
import { CENTRY_AGENT_SYSTEM_PROMPT, fallbackPositionAnswer } from '../../../lib/agentContext';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../lib/rateLimit';
import { SWAP_MARKETS } from '../../../constants/markets';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const ACTIONS = Object.freeze({ supply:'lending.supply', withdraw:'lending.withdraw', borrow:'lending.borrow', repay:'lending.repay', lock:'governance.createLock', increaseLock:'governance.increaseLock', extendLock:'governance.extendLock', withdrawLock:'governance.withdrawLock', reward:'rewards.claim', swap:'swap', bridge:'bridge', gateway:'gateway.fund' });
function cleanText(value, maxLength) { return String(value ?? '').trim().slice(0, maxLength); }
const MARKET_REFERENCE = SWAP_MARKETS.filter((market) => market.address).map((market) => ({ id: market.id, symbol: market.symbol, decimals: market.decimals, address: market.address, status: market.status }));
function marketBySymbol(symbol, context) { const requested = String(symbol || context?.market || 'USDC').toLowerCase(); return MARKET_REFERENCE.find((m) => m.symbol.toLowerCase() === requested || m.id.toLowerCase() === requested) || MARKET_REFERENCE.find((m) => m.symbol === 'USDC'); }
function parseNumber(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function parseExplicitExecution(question, context) {
  const text = question.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
  let match = text.match(/\b(borrow|supply|deposit|withdraw|repay)\s+(\d+(?:\.\d+)?)\s*(usdc|eurc|cirbtc|cent)?\b/);
  if (match) { const kind = match[1] === 'deposit' ? 'supply' : match[1]; const market = marketBySymbol(match[3], context); const amount = parseNumber(match[2]); if (amount && market) return { answer: `${kind[0].toUpperCase()}${kind.slice(1)} ${amount} ${market.symbol} on Arc. Opening the wallet signature now.`, plan: { title: `${kind[0].toUpperCase()}${kind.slice(1)} ${market.symbol}`, reason: 'Explicit transaction request.', autoExecute: true, actions: [{ type: ACTIONS[kind], asset: market.address, assetSymbol: market.symbol, decimals: market.decimals, amount: String(amount) }] } }; }
  match = text.match(/\bswap\s+(\d+(?:\.\d+)?)\s*(usdc|eurc|cirbtc|cent)\s+(?:to|for)\s+(usdc|eurc|cirbtc|cent)\b/);
  if (match) { const input = marketBySymbol(match[2], context); const output = marketBySymbol(match[3], context); const amount = parseNumber(match[1]); if (amount && input && output && input.address && output.address) { const raw = (() => { try { return BigInt(Math.round(amount * 10 ** input.decimals)).toString(); } catch { return null; } })(); if (raw) return { answer: `Swap ${amount} ${input.symbol} to ${output.symbol}. Opening the wallet signature now.`, plan: { title: `Swap ${input.symbol} → ${output.symbol}`, reason: 'Explicit swap request.', autoExecute: true, actions: [{ type: ACTIONS.swap, inputToken: input.address, outputToken: output.address, inputDecimals: input.decimals, inputSymbol: input.symbol, outputSymbol: output.symbol, amount: String(amount), amountRaw: raw, slippage: 0.5 }] } }; }
  match = text.match(/\bbridge\s+(\d+(?:\.\d+)?)\s*usdc\s+(?:from\s+)?(arc|base|arbitrum|ethereum)\s+(?:to|→)\s+(arc|base|arbitrum|ethereum)\b/);
  if (match && match[2] !== match[3]) { const amount = parseNumber(match[1]); if (amount) return { answer: `Bridge ${amount} USDC from ${match[2]} to ${match[3]}. Opening the wallet signature now.`, plan: { title: `Bridge USDC`, reason: 'Explicit bridge request.', autoExecute: true, actions: [{ type: ACTIONS.bridge, fromChain: match[2], toChain: match[3], amount: String(amount) }] } }; }
  match = text.match(/\b(?:claim|claim my)\s+(?:reward|rewards)\s+(?:for\s+)?(?:vec?ent\s*)?#?(\d+)\b/);
  if (match) return { answer: `Claim reward for veCENT #${match[1]}. Opening the wallet signature now.`, plan: { title: `Claim veCENT #${match[1]} reward`, reason: 'Explicit reward claim request.', autoExecute: true, actions: [{ type: ACTIONS.reward, tokenId: Number(match[1]) }] } };
  match = text.match(/\b(?:lock)\s+(\d+(?:\.\d+)?)\s*cent\s+(?:for\s+)?(\d+)\s*weeks?\b/);
  if (match) { const amount = parseNumber(match[1]); const weeks = Number(match[2]); if (amount && weeks > 0) return { answer: `Lock ${amount} CENT for ${weeks} weeks. Opening the wallet signature now.`, plan: { title: `Create ${weeks}-week veCENT lock`, reason: 'Explicit governance request.', autoExecute: true, actions: [{ type: ACTIONS.lock, amount: String(amount), weeks }] } }; }
  return null;
}
const EXECUTION_SCHEMA = `Return JSON only. If the user asks to transact, return {"answer":"...","plan":{"title":"...","reason":"...","autoExecute":false,"actions":[...]}}. Allowed actions: lending.supply, lending.withdraw, lending.borrow, lending.repay, token.approve, token.approveCent, governance.createLock, governance.increaseLock, governance.extendLock, governance.withdrawLock, rewards.claim, swap, bridge, gateway.fund. Supported bridge keys: arc, base, arbitrum, ethereum. Never invent token addresses, balances, tokenIds, reward proofs, calldata, or hashes. For rewards.claim provide only tokenId. For gateway.fund provide amount. For swap provide inputToken, outputToken, amount, inputDecimals, inputSymbol, outputSymbol, amountRaw, slippage. For bridge provide fromChain, toChain, amount. Do not warn about liquidation unless the supplied health factor is below 1.0. When the user explicitly asks for an action, prioritize the action plan over generic financial commentary.`;
function buildPrompt({ question, context }) { return `${CENTRY_AGENT_SYSTEM_PROMPT}\n\n${EXECUTION_SCHEMA}\n\nMARKETS:\n${JSON.stringify(MARKET_REFERENCE)}\n\nPOSITION:\n${JSON.stringify(context, null, 2)}\n\nREQUEST:\n${question}`; }
function parseModelJson(text) { try { return JSON.parse(String(text || '').trim()); } catch { return null; } }
export async function POST(request) {
  const limit = rateLimit(request, 'assistant', { max: 12, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const body = await request.json();
    const question = cleanText(body?.question, 500);
    const context = body?.context && typeof body.context === 'object' ? body.context : {};
    if (!question) return withRateLimitHeaders(NextResponse.json({ success: false, error: 'Ask a question about Centry.' }, { status: 400 }), limit);
    const explicit = parseExplicitExecution(question, context);
    if (explicit) return withRateLimitHeaders(NextResponse.json({ success: true, ...explicit, provider: 'deterministic' }), limit);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return withRateLimitHeaders(NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback' }), limit);
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: CENTRY_AGENT_SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: buildPrompt({ question, context }) }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 700 } }), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return withRateLimitHeaders(NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback', warning: 'AI provider unavailable.' }), limit);
    const parsed = parseModelJson(data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join(''));
    if (!parsed) return withRateLimitHeaders(NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: model }), limit);
    return withRateLimitHeaders(NextResponse.json({ success: true, answer: parsed.answer || fallbackPositionAnswer(context, question), plan: parsed.plan || null, provider: model }), limit);
  } catch (error) { return withRateLimitHeaders(NextResponse.json({ success: false, error: error?.message || 'Centrion is temporarily unavailable.' }, { status: 500 }), limit); }
}
