/** How long an uploaded input stays in the Blob store. A daily cron deletes
    anything older, so a shared studio link cannot fill the owner's quota; by
    then the platform has long since read the file for its run. */
export const UPLOAD_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Uploads live on the Blob store's own host; generated results do not. */
export function isBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
