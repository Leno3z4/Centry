import { NextResponse } from 'next/server';
import { CENTRY_AGENT_SYSTEM_PROMPT, fallbackPositionAnswer } from '../../../lib/agentContext';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function buildPrompt({ question, context }) {
  return `${CENTRY_AGENT_SYSTEM_PROMPT}\n\nCurrent onchain position snapshot (provided by the app):\n${JSON.stringify(context, null, 2)}\n\nUser question:\n${question}\n\nAnswer directly in plain text. Keep it under 120 words unless the question genuinely requires more detail.`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const question = cleanText(body?.question, 500);
    const context = body?.context && typeof body.context === 'object' ? body.context : {};

    if (!question) {
      return NextResponse.json({ success: false, error: 'Ask a question about the current Centry position.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback' });
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CENTRY_AGENT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt({ question, context }) }] }],
        generationConfig: {
          responseMimeType: 'text/plain',
          maxOutputTokens: 350,
        },
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback', warning: 'AI provider unavailable.' });
    }

    const answer = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('').trim();
    if (!answer) {
      return NextResponse.json({ success: true, answer: fallbackPositionAnswer(context, question), provider: 'local-fallback' });
    }

    return NextResponse.json({ success: true, answer, provider: model });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || 'Centry Intelligence is temporarily unavailable.' }, { status: 500 });
  }
}
