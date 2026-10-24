import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

import { blobPathname, mintDeviceId } from "./device";
import { MCP_UPLOAD_PREFIX, MCP_UPLOAD_RETENTION_MS } from "./retention";
import { UPLOAD_LIMITS, formatMegabytes, uploadKindOf, type UploadKind } from "./upload-limits";

/* Claude cannot hand a chat attachment to the connector itself: tool calls
   carry text, and the files live in its sandbox. So the connector issues a
   one-file upload into the deployment owner's Blob store — a client token
   scoped to one pathname, one content type, a size cap and a few minutes —
   and Claude sends the file with a single PUT. Neither the store's
   read-write token nor the Higgsfield key leaves the server. */

const MB = 1024 * 1024;
/* Tighter than the studio's for video: a connector upload is one PUT. */
const MCP_MAX_BYTES: Record<UploadKind, number> = { image: 20 * MB, video: 100 * MB, audio: 50 * MB };
const TICKET_MS = 15 * 60 * 1000;
const API_URL = "https://vercel.com/api/blob";
/* The Blob API version the installed SDK speaks. */
const API_VERSION = "12";

export type UploadTicket = {
  /** Where the file can be read once the PUT lands — pass it to generate. */
  url: string;
  pathname: string;
  contentType: string;
  maxBytes: number;
  expiresAt: string;
  /** The PUT, as a curl command with `{FILE}` in place of the local path. */
  command: string;
};

export async function createUploadTicket(filename: string, sizeBytes: number, contentType?: string): Promise<UploadTicket> {
  const kind = uploadKindOf(filename);
  if (!kind) {
    throw new Error(
      `Tipo de archivo no permitido (${filename}). Usa imágenes ${UPLOAD_LIMITS.image.extensions.join(", ")}, video ${UPLOAD_LIMITS.video.extensions.join(", ")} o audio ${UPLOAD_LIMITS.audio.extensions.join(", ")}.`,
    );
  }
  const limit = UPLOAD_LIMITS[kind];
  const type = contentType?.trim().toLowerCase() || typeFromExtension(filename, kind);
  if (!limit.types.includes(type)) {
    throw new Error(`Tipo de contenido no permitido para ${kind}: ${type}. Permitidos: ${limit.types.join(", ")}.`);
  }
  const maxBytes = Math.min(limit.maxBytes, MCP_MAX_BYTES[kind]);
  if (sizeBytes > maxBytes) {
    throw new Error(`El archivo pesa ${formatMegabytes(sizeBytes)}; el máximo para ${kind} es ${formatMegabytes(maxBytes)}.`);
  }

  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
  if (!token) throw new Error("Missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN");
  const storeId = token.split("_")[3];
  if (!storeId) throw new Error("OPEN_HIGGSFIELD_READ_WRITE_TOKEN is not a Blob read-write token");

  /* A fresh random folder per upload: the URL cannot be guessed, and no
     ticket can overwrite another file. */
  const pathname = MCP_UPLOAD_PREFIX + blobPathname(mintDeviceId(), filename);
  const validUntil = Date.now() + TICKET_MS;
  const clientToken = await generateClientTokenFromReadWriteToken({
    token,
    pathname,
    allowedContentTypes: [type],
    maximumSizeInBytes: maxBytes,
    validUntil,
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  const target = `${API_URL}/?${new URLSearchParams({ pathname })}`;
  const command = [
    "curl -sS --fail-with-body -X PUT",
    `-H 'authorization: Bearer ${clientToken}'`,
    `-H 'x-api-version: ${API_VERSION}'`,
    `-H 'x-vercel-blob-store-id: ${storeId}'`,
    "-H 'x-vercel-blob-access: public'",
    `-H 'x-content-type: ${type}'`,
    `--data-binary @'{FILE}'`,
    `'${target}'`,
  ].join(" ");

  return {
    url: `https://${storeId}.public.blob.vercel-storage.com/${pathname}`,
    pathname,
    contentType: type,
    maxBytes,
    expiresAt: new Date(validUntil).toISOString(),
    command,
  };
}

export const MCP_UPLOAD_HOURS = MCP_UPLOAD_RETENTION_MS / 3_600_000;

function typeFromExtension(filename: string, kind: UploadKind): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    wav: "audio/wav",
    mp3: "audio/mpeg",
  };
  return byExt[ext] ?? UPLOAD_LIMITS[kind].types[0]!;
}
