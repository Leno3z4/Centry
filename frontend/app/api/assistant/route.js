import { NextResponse } from 'next/server';
import { CENTRY_AGENT_SYSTEM_PROMPT, fallbackPositionAnswer } from '../../../lib/agentContext';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../lib/rateLimit';
import { SWAP_MARKETS } from '../../../constants/markets';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
function cleanText(value, maxLength) { return String(value ?? '').trim().slice(0, maxLength); }
const MARKET_REFERENCE = SWAP_MARKETS.filter((market) => market.address).map((market) => ({ id: market.id, symbol: market.symbol, decimals: market.decimals, address: market.address, status: market.status }));
const EXECUTION_SCHEMA = `Return JSON only. If the user asks to transact, return {"answer":"...","plan":{"title":"...","reason":"...","actions":[...]}}. Allowed actions: lending.supply, lending.withdraw, lending.borrow, lending.repay, token.approve, token.approveCent, governance.createLock, governance.increaseLock, governance.extendLock, governance.withdrawLock, rewards.claim, swap, bridge, gateway.fund. Supported bridge keys: arc, base, arbitrum, ethereum. Never invent token addresses, balances, tokenIds, reward proofs, calldata, or hashes. For rewards.claim provide only tokenId. For gateway.fund provide amount. For swap provide inputToken, outputToken, amount, inputDecimals, inputSymbol, outputSymbol, amountRaw, slippage. For bridge provide fromChain, toChain, amount. Omit plan for analysis-only questions.`;
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
