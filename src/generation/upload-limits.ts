/* What the studio accepts as an input, shared by the browser (to refuse early,
   with a reason) and the upload route (to enforce it). */

export type UploadKind = "image" | "video" | "audio";

const MB = 1024 * 1024;

export const UPLOAD_LIMITS: Record<UploadKind, { maxBytes: number; types: string[]; extensions: string[] }> = {
  image: {
    maxBytes: 20 * MB,
    types: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    extensions: ["jpg", "jpeg", "png", "webp", "gif"],
  },
  video: {
    maxBytes: 200 * MB,
    types: ["video/mp4", "video/quicktime"],
    extensions: ["mp4", "mov"],
  },
  audio: {
    maxBytes: 50 * MB,
    types: ["audio/wav", "audio/x-wav", "audio/mpeg"],
    extensions: ["wav", "mp3"],
  },
};

/** The kind a file name's extension declares, or null for one the studio does not take. */
export function uploadKindOf(name: string): UploadKind | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  for (const [kind, limit] of Object.entries(UPLOAD_LIMITS) as [UploadKind, (typeof UPLOAD_LIMITS)[UploadKind]][]) {
    if (limit.extensions.includes(ext)) return kind;
  }
  return null;
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}
