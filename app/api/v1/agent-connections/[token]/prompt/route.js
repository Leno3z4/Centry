function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request, { params }) {
  const { token } = await params;
  const baseUrl = process.env.CENTRY_AGENT_BASE_URL || new URL(request.url).origin;
  const skillUrl = `${baseUrl}/api/v1/agent-connections/${encodeURIComponent(token)}`;

  return textResponse(
    `Connect this agent to my Centry account.\n\nRead this Centry connection skill first:\n${skillUrl}\n\nFetch that URL, follow the returned instructions exactly, establish the authenticated Centry session, and then use only the capabilities returned by Centry. Do not expose or repeat the connection credential or session token.\n`
  );
}
