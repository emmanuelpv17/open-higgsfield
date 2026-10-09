import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createStudioMcpServer } from "./mcp-server";
import { createPlatformClient } from "./platform";

/** Answers one MCP request on the given Higgsfield key. Stateless: a fresh
    server and transport per request, answered as JSON. */
export async function serveMcp(request: Request, apiKey: string): Promise<Response> {
  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) return new Response("Missing HF_API_BASE_URL", { status: 500 });
  const client = createPlatformClient({ apiKey, baseUrl });

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

/** "id:secret" with both halves present and no whitespace. */
export function isIdSecret(value: string): boolean {
  return /^[^\s:]{1,200}:[^\s:]{1,400}$/.test(value);
}

/** A key as it may appear in logs: the first four characters of its id and
    nothing of its secret. */
export function maskKey(value: string): string {
  const id = value.split(":")[0] ?? "";
  return `${id.slice(0, 4)}…(${value.length} chars)`;
}
