import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";

import { downloadName, verifyDownload } from "@/generation/download-link";
import { MCP_UPLOAD_PREFIX } from "@/generation/retention";

/* Opened from a result tile's Descargar (see download-link.ts): copies the
   result into the Blob store under mcp/, which the daily cleanup clears,
   and redirects to its download URL, which the store serves as an
   attachment with the given name. */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const source = params.get("u") ?? "";
  if (!verifyDownload(source, params.get("e") ?? "", params.get("s") ?? "")) {
    return new Response("Enlace de descarga no válido o vencido.", { status: 403 });
  }
  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
  if (!token) return new Response("Missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN", { status: 500 });

  const name = downloadName(params.get("n"), source);
  try {
    const upstream = await fetch(source);
    if (!upstream.ok || !upstream.body) return new Response("No se pudo leer el archivo.", { status: 502 });
    /* A folder of its own keeps the name exact: the attachment is saved
       under the pathname's last segment. */
    const blob = await put(`${MCP_UPLOAD_PREFIX}downloads/${randomUUID()}/${name}`, upstream.body, {
      access: "public",
      token,
      contentType: upstream.headers.get("content-type") ?? undefined,
      addRandomSuffix: false,
    });
    return Response.redirect(blob.downloadUrl, 302);
  } catch (error) {
    console.error("[download] failed", { name, error: error instanceof Error ? error.message : String(error) });
    return new Response("No se pudo preparar la descarga. Intenta de nuevo.", { status: 502 });
  }
}
