import { put } from "@vercel/blob/client";

import { UPLOAD_LIMITS, formatMegabytes, uploadKindOf } from "./upload-limits";

export async function uploadMedia(file: File): Promise<{ url: string }> {
  const kind = uploadKindOf(file.name);
  if (!kind) {
    throw new Error("tipo de archivo no permitido. Usa imágenes JPG, PNG, WEBP o GIF, video MP4 o MOV, o audio WAV o MP3");
  }
  const { maxBytes } = UPLOAD_LIMITS[kind];
  if (file.size > maxBytes) {
    throw new Error(`el archivo pasa el límite de ${formatMegabytes(maxBytes)} para ${kind === "image" ? "imágenes" : kind === "video" ? "videos" : "audio"}`);
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
    throw new Error(typeof refusal?.error === "string" ? refusal.error : "No se pudo preparar la subida");
  }
  const { clientToken, pathname } = (await res.json()) as {
    clientToken?: unknown;
    pathname?: unknown;
  };
  if (typeof clientToken !== "string" || typeof pathname !== "string") {
    throw new Error("No se pudo preparar la subida");
  }
  const blob = await put(pathname, file, { access: "public", token: clientToken });
  return { url: blob.url };
}
