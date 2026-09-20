import { readFile } from 'node:fs/promises';

const SKILL_URL = new URL(
  '../../../../../skills/centry-connect/SKILL.md',
  import.meta.url,
);

export async function GET() {
  try {
    const skill = await readFile(SKILL_URL, 'utf8');

    return new Response(skill, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    console.error('centry_skill_load_failed', error);

    return Response.json(
      { error: 'skill_unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
