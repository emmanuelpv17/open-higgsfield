import { put } from "@vercel/blob/client";

import { UPLOAD_LIMITS, formatMegabytes, uploadKindOf } from "./upload-limits";

export async function uploadMedia(file: File): Promise<{ url: string }> {
  const kind = uploadKindOf(file.name);
  if (!kind) {
    throw new Error("unsupported file type. Use JPG, PNG, WEBP or GIF images, MP4 or MOV video, WAV or MP3 audio");
  }
  const { maxBytes } = UPLOAD_LIMITS[kind];
  if (file.size > maxBytes) {
    throw new Error(`the file is over the ${formatMegabytes(maxBytes)} limit for ${kind}`);
  }
  const res = await fetch("/api/blob", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname: file.name, clientPayload: null, multipart: false },
    }),
  });
  if (!res.ok) {
    const refusal = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof refusal?.error === "string" ? refusal.error : "Failed to retrieve the client token");
  }
  const { clientToken, pathname } = (await res.json()) as {
    clientToken?: unknown;
    pathname?: unknown;
  };
  if (typeof clientToken !== "string" || typeof pathname !== "string") {
    throw new Error("Failed to retrieve the client token");
  }
  const blob = await put(pathname, file, { access: "public", token: clientToken });
  return { url: blob.url };
}
