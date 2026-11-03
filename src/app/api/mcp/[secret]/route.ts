import { timingSafeEqual } from "node:crypto";

import { serveMcp } from "@/generation/mcp-http";

/* Claude's custom connector. The secret path segment is the only gate, and
   every call spends from the key in OPEN_HIGGSFIELD_MCP_API_KEY, so the route
   stays dark (404) unless both variables are set and the segment matches. */

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ secret: string }> };

function authorized(given: string): boolean {
  const expected = process.env.OPEN_HIGGSFIELD_MCP_SECRET;
  if (!expected || expected.length < 24 || !process.env.OPEN_HIGGSFIELD_MCP_API_KEY) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Some clients fold a query in the connector URL (`…/<secret>?v=2`, added to
   make Claude fetch a fresh tool list) into the path segment, so the secret
   arrives as "<secret>?v=2" or "<secret>%3Fv%3D2". Only what precedes it is
   the secret. */
function secretOf(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    /* A malformed escape is compared as given, and fails. */
  }
  return decoded.split(/[?&#;]/)[0] ?? "";
}

async function handle(request: Request, context: Context): Promise<Response> {
  const { secret } = await context.params;
  if (!authorized(secretOf(secret))) return new Response("Not found", { status: 404 });
  return serveMcp(request, process.env.OPEN_HIGGSFIELD_MCP_API_KEY!.trim());
}

export { handle as GET, handle as POST, handle as DELETE };
