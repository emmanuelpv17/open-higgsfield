import { put } from "@vercel/blob";

import { blobPathname, mintDeviceId } from "./device";
import { MCP_UPLOAD_PREFIX } from "./retention";
import { UPLOAD_LIMITS, formatMegabytes, uploadKindOf, type UploadKind } from "./upload-limits";

/* A small file sent inline to generate as a data: URI is stored in the
   owner's Blob store under mcp/ first, so the platform gets an https link. */

const MB = 1024 * 1024;
const MAX_BYTES: Record<UploadKind, number> = { image: 10 * MB, video: 100 * MB, audio: 50 * MB };

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
