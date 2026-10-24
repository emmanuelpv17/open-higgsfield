import { del, list, put } from "@vercel/blob";

import { blobPathname, mintDeviceId } from "./device";
import { sha256 } from "./key-check";
import { MCP_UPLOAD_PREFIX } from "./retention";
import { UPLOAD_LIMITS, formatMegabytes, uploadKindOf, type UploadKind } from "./upload-limits";

/* Files reach the connector as base64 inside tool calls — the one channel a
   chat attachment can take without Claude uploading it anywhere itself. Each
   call is capped by the function's request size, so a larger file comes in
   parts: every part is parked in the owner's Blob store under the caller's
   key hash and an upload id, and the last one joins them into the file. */

const MB = 1024 * 1024;
const MAX_BYTES: Record<UploadKind, number> = { image: 10 * MB, video: 100 * MB, audio: 50 * MB };
/* Vercel refuses request bodies over 4.5 MB, base64 included. */
export const MAX_PART_BASE64 = 3_000_000;
const MAX_PARTS = 400;
const PARTS_PREFIX = `${MCP_UPLOAD_PREFIX}parts/`;
const UPLOAD_ID_RE = /^[a-f0-9]{32}$/;

export type PartResult =
  | { done: false; uploadId: string; received: number; totalParts: number }
  | { done: true; uploadId: string; url: string; bytes: number; contentType: string };

function blobToken(): string {
  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
  if (!token) throw new Error("Missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN");
  return token;
}

/** The kind and content type a file may be stored as, or a reason it may not. */
export function checkFile(filename: string, contentType: string | undefined, bytes: number) {
  const kind = uploadKindOf(filename);
  if (!kind) {
    throw new Error(
      `Tipo de archivo no permitido (${filename}). Usa imágenes ${UPLOAD_LIMITS.image.extensions.join(", ")}, video ${UPLOAD_LIMITS.video.extensions.join(", ")} o audio ${UPLOAD_LIMITS.audio.extensions.join(", ")}.`,
    );
  }
  const type = contentType?.trim().toLowerCase() || typeFromExtension(filename, kind);
  if (!UPLOAD_LIMITS[kind].types.includes(type)) {
    throw new Error(`Tipo de contenido no permitido para ${kind}: ${type}. Permitidos: ${UPLOAD_LIMITS[kind].types.join(", ")}.`);
  }
  const max = Math.min(UPLOAD_LIMITS[kind].maxBytes, MAX_BYTES[kind]);
  if (bytes > max) throw new Error(`El archivo pesa ${formatMegabytes(bytes)}; el máximo para ${kind} es ${formatMegabytes(max)}.`);
  return { kind, type, max };
}

/** Stores a whole file under mcp/ and returns its public URL. */
export async function storeFile(bytes: Uint8Array, filename: string, contentType?: string): Promise<string> {
  if (bytes.byteLength === 0) throw new Error("El archivo está vacío.");
  const { type } = checkFile(filename, contentType, bytes.byteLength);
  const pathname = MCP_UPLOAD_PREFIX + blobPathname(mintDeviceId(), filename);
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "public",
    token: blobToken(),
    contentType: type,
    addRandomSuffix: false,
  });
  return blob.url;
}

function cleanBase64(data: string): string {
  const clean = data.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) throw new Error("data_base64 no es base64 válido.");
  return clean;
}

export function decodeBase64(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(cleanBase64(data), "base64"));
}

/** One part of a file; the last part (part === totalParts) joins and stores it. */
export async function receivePart(input: {
  apiKey: string;
  uploadId?: string;
  part: number;
  totalParts: number;
  filename: string;
  contentType?: string;
  data: string;
}): Promise<PartResult> {
  const { part, totalParts, filename, contentType } = input;
  if (totalParts < 1 || totalParts > MAX_PARTS) throw new Error(`total_parts debe estar entre 1 y ${MAX_PARTS}.`);
  if (part < 1 || part > totalParts) throw new Error(`part debe estar entre 1 y ${totalParts}.`);
  if (input.data.length > MAX_PART_BASE64) {
    throw new Error(`Cada parte admite hasta ${MAX_PART_BASE64} caracteres de base64; divide el archivo en más partes.`);
  }
  /* Refused before anything is stored: a wrong name or type fails on part 1. */
  checkFile(filename, contentType, 0);
  const piece = cleanBase64(input.data);
  if (!piece) throw new Error("La parte está vacía.");

  if (totalParts === 1) {
    const bytes = decodeBase64(piece);
    if (input.uploadId) throw new Error("upload_id solo se usa con archivos en varias partes.");
    const { type } = checkFile(filename, contentType, bytes.byteLength);
    const url = await storeFile(bytes, filename, type);
    return { done: true, uploadId: "", url, bytes: bytes.byteLength, contentType: type };
  }

  if (part === 1 && input.uploadId) throw new Error("La parte 1 no lleva upload_id; se devuelve uno nuevo.");
  if (part > 1 && !input.uploadId) throw new Error("Falta upload_id (lo devolvió la parte 1).");
  const uploadId = input.uploadId ?? mintDeviceId();
  if (!UPLOAD_ID_RE.test(uploadId)) throw new Error("upload_id no es válido.");
  /* Parts are kept as base64 text and decoded only once joined: a split that
     falls mid-quartet would corrupt a part decoded on its own. Parts sit under
     the key's hash, so one caller cannot add to another's file. */
  const folder = `${PARTS_PREFIX}${(await sha256(input.apiKey)).slice(0, 32)}/${uploadId}/`;
  const token = blobToken();
  await put(`${folder}${String(part).padStart(4, "0")}`, piece, {
    access: "public",
    token,
    contentType: "text/plain",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  if (part < totalParts) return { done: false, uploadId, received: part, totalParts };

  const stored = await listAll(folder, token);
  const byPart = new Map(stored.map((blob) => [Number(blob.pathname.slice(folder.length)), blob]));
  const missing = Array.from({ length: totalParts }, (_, i) => i + 1).filter((n) => !byPart.has(n));
  if (missing.length) throw new Error(`Faltan las partes ${missing.join(", ")} de upload_id ${uploadId}; envíalas y vuelve a enviar la última.`);
  const base64Length = Array.from({ length: totalParts }, (_, i) => byPart.get(i + 1)!.size).reduce((a, b) => a + b, 0);
  const { type } = checkFile(filename, contentType, Math.floor((base64Length * 3) / 4));
  const pieces = await Promise.all(
    Array.from({ length: totalParts }, async (_, i) => {
      const response = await fetch(byPart.get(i + 1)!.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo leer la parte ${i + 1} (${response.status}).`);
      return response.text();
    }),
  );
  const joined = decodeBase64(pieces.join(""));
  const url = await storeFile(joined, filename, type);
  await del(stored.map((blob) => blob.url), { token }).catch(() => {});
  return { done: true, uploadId, url, bytes: joined.byteLength, contentType: type };
}

async function listAll(prefix: string, token: string) {
  const blobs: Awaited<ReturnType<typeof list>>["blobs"] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, token, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

/** A `data:<type>;base64,<data>` URI stored as a file, for generate's media. */
export async function storeDataUri(uri: string, role: string): Promise<string> {
  const match = uri.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,/i);
  if (!match) throw new Error(`La data URI de '${role}' debe tener la forma data:<tipo>;base64,<datos>.`);
  const type = match[1]!.toLowerCase();
  const ext = Object.entries(EXT_TYPES).find(([, t]) => t === type)?.[0];
  if (!ext) throw new Error(`Tipo no permitido en la data URI de '${role}': ${type}.`);
  return storeFile(decodeBase64(uri), `${role}.${ext}`, type);
}

const EXT_TYPES: Record<string, string> = {
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

function typeFromExtension(filename: string, kind: UploadKind): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? UPLOAD_LIMITS[kind].types[0]!;
}
