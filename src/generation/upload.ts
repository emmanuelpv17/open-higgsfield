import { createUploadTarget } from "./actions";

export class UploadError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

/** Sends one file to Higgsfield storage and resolves to its public URL — only
    once the storage PUT has succeeded, so an interrupted upload never reaches a
    generate request. The signed URL is used once and never logged or kept. */
export async function uploadMedia(file: File): Promise<{ url: string }> {
  const contentType = file.type;
  const created = await createUploadTarget({ contentType });
  if (!created.ok) throw new UploadError(created.error, created.code);

  const { uploadUrl, uploadHeaders, publicUrl } = created.target;
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      headers: uploadHeaders,
      body: file,
      credentials: "omit",
    });
  } catch {
    throw new UploadError("The file didn't reach storage. Check the connection and retry.", "network");
  }
  if (!response.ok) {
    throw new UploadError(`Storage refused the file (${response.status}). Retry the upload.`, "server");
  }
  return { url: publicUrl };
}
