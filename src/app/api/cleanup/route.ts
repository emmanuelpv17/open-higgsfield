import { del, list } from "@vercel/blob";
import { NextResponse } from "next/server";

import { UPLOAD_RETENTION_MS } from "@/generation/retention";

/* Run daily by Vercel Cron (vercel.json). With CRON_SECRET set, Vercel sends it
   as a bearer token and nothing else gets in; without it, only the cron's own
   user agent is let through. Either way it only ever removes expired uploads. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });

  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN" }, { status: 500 });

  const cutoff = Date.now() - UPLOAD_RETENTION_MS;
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;
  do {
    const page = await list({ token, cursor, limit: 1000 });
    scanned += page.blobs.length;
    const expired = page.blobs
      .filter((blob) => new Date(blob.uploadedAt).getTime() < cutoff)
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

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  return (request.headers.get("user-agent") ?? "").startsWith("vercel-cron");
}
