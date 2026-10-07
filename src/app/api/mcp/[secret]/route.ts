import { timingSafeEqual } from "node:crypto";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createStudioMcpServer } from "@/generation/mcp-server";
import { createPlatformClient } from "@/generation/platform";

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

async function handle(request: Request, context: Context): Promise<Response> {
  const { secret } = await context.params;
  if (!authorized(secret)) return new Response("Not found", { status: 404 });

  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) return new Response("Missing HF_API_BASE_URL", { status: 500 });
  const client = createPlatformClient({ apiKey: process.env.OPEN_HIGGSFIELD_MCP_API_KEY!.trim(), baseUrl });

  /* Stateless: a fresh server and transport per request, answered as JSON. */
  const server = createStudioMcpServer(client);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
