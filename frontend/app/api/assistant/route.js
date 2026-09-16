import { NextResponse } from 'next/server';
import { CENTRY_AGENT_SYSTEM_PROMPT, fallbackPositionAnswer } from '../../../lib/agentContext';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

function cleanText(value, maxLength) { return String(value ?? '').trim().slice(0, maxLength); }

const EXECUTION_SCHEMA = `Return JSON with this exact shape when the request contains a Centry action: {"answer":"brief explanation","plan":{"title":"short title","reason":"why this action matches the request","actions":[...]}}. Only use these action types: lending.supply, lending.withdraw, lending.borrow, lending.repay, token.approve, token.approveCent, governance.createLock, governance.increaseLock, governance.extendLock, governance.withdrawLock, rewards.claim, gateway.fund. Each action must contain the exact asset address/amount/tokenId/weeks needed by the request. Never invent addresses, tokenIds, reward proofs, balances, or amounts. For rewards.claim, only provide tokenId; the app resolves the published proof locally. For gateway.fund, only provide amount. When the user is asking for analysis without asking to transact, omit plan. Never return arbitrary contract calldata.`;

function buildPrompt({ question, context }) {
  return `${CENTRY_AGENT_SYSTEM_PROMPT}\n\n${EXECUTION_SCHEMA}\n\nCurrent onchain position snapshot (provided by the app):\n${JSON.stringify(context, null, 2)}\n\nUser request:\n${question}\n\nReturn only valid JSON. Keep answer under 120 words.`;
}

function parseModelJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const question = cleanText(body?.question, 500);
    const context = body?.context && typeof body.context === 'object' ? body.context : {};
    if (!question) return NextResponse.json({ success: false, error: 'Ask a question about Centry.' }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback' });

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CENTRY_AGENT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt({ question, context }) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 600 },
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback', warning: 'AI provider unavailable.' });

    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('').trim();
    const parsed = parseModelJson(text);
    if (!parsed) return NextResponse.json({ success: true, answer: text || fallbackPositionAnswer(context, question), provider: model });

    return NextResponse.json({ success: true, answer: parsed.answer || fallbackPositionAnswer(context, question), plan: parsed.plan || null, provider: model });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Centrion is temporarily unavailable.' }, { status: 500 });
  }
}
