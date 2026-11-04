import { VIEWER_SCRIPT } from "@/generation/mcp-viewer";

/* The result viewer's script, loaded fresh by every viewer page, so a page
   a host kept from earlier still runs the current code. */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(VIEWER_SCRIPT, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}
