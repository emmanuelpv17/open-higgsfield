import { readViewerLog, writeViewerLog } from "@/generation/run-index";

/* Temporary: the result tile's button timings (no prompts), readable while
   a host's behaviour is being worked out. Remove with the diagnostics. */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  /* ?probe writes a test entry and reports how the write went. */
  if (new URL(request.url).searchParams.has("probe")) {
    try {
      await writeViewerLog(`probe ${new Date().toISOString()}`);
      return new Response("probe ok");
    } catch (error) {
      return new Response(`probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return new Response(await readViewerLog(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const text = (await request.text()).slice(0, 4000);
  if (text) await writeViewerLog(text).catch(() => {});
  return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*" } });
}
