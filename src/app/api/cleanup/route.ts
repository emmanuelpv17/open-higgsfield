import { del, list } from "@vercel/blob";
import { NextResponse } from "next/server";

import { MCP_UPLOAD_PREFIX, MCP_UPLOAD_RETENTION_MS, UPLOAD_RETENTION_MS } from "@/generation/retention";

/* Run daily by Vercel Cron (vercel.json). Vercel sends CRON_SECRET as a bearer
   token and nothing else gets in; without it set the route refuses everyone,
   since any client can claim the cron's user agent. It only ever removes
   expired uploads. */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });

  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN" }, { status: 500 });

  const now = Date.now();
  const cutoffOf = (pathname: string) =>
    now - (pathname.startsWith(MCP_UPLOAD_PREFIX) ? MCP_UPLOAD_RETENTION_MS : UPLOAD_RETENTION_MS);
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    scanned += page.blobs.length;
    const expired = page.blobs
      .filter((blob) => new Date(blob.uploadedAt).getTime() < cutoffOf(blob.pathname))
      .map((blob) => blob.url);
    if (expired.length) {
      await del(expired, { token });
      deleted += expired.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  console.info("[cleanup] uploads", { scanned, deleted });
  return NextResponse.json({ scanned, deleted });
}
