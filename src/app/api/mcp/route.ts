import { isIdSecret, maskKey, serveMcp } from "@/generation/mcp-http";

/* Claude's connector for anyone: each caller brings their own Higgsfield key
   in the X-Higgsfield-Key header, and only that key is used — never the
   server's OPEN_HIGGSFIELD_MCP_API_KEY. The key is neither stored nor logged;
   logs see it masked. */

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADER = "x-higgsfield-key";

function howTo(origin: string): string {
  const url = `${origin}/api/mcp`;
  return (
    "Cómo agregarlo en claude.ai: Configuración → Conectores → Agregar conector personalizado → " +
    `URL ${url} → en "Encabezados de solicitud" pulsa "Agregar encabezado", nombre X-Higgsfield-Key ` +
    "y valor tu clave completa de Higgsfield en formato id:secret (open.higgsfield.ai → API keys). " +
    `En Claude Code: claude mcp add --transport http higgsfield ${url} ` +
    '--header "X-Higgsfield-Key: <id>:<secret>".'
  );
}

function refuse(request: Request, reason: string): Response {
  const message = `${reason} ${howTo(new URL(request.url).origin)}`;
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

async function handle(request: Request): Promise<Response> {
  const raw = request.headers.get(HEADER)?.trim();
  if (!raw) {
    console.info("[mcp] refused: missing key header");
    return refuse(request, "Falta el encabezado X-Higgsfield-Key con tu clave de Higgsfield.");
  }
  if (!isIdSecret(raw)) {
    console.info("[mcp] refused: malformed key", { key: maskKey(raw) });
    return refuse(
      request,
      "El encabezado X-Higgsfield-Key no tiene el formato id:secret (deben ir las dos partes de la clave unidas por dos puntos).",
    );
  }
  console.info("[mcp] request", { method: request.method, key: maskKey(raw) });
  return serveMcp(request, raw);
}

export { handle as GET, handle as POST, handle as DELETE };
