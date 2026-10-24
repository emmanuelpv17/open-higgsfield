/** How long an uploaded input stays in the Blob store. A daily cron deletes
    anything older, so a shared studio link cannot fill the owner's quota; by
    then the platform has long since read the file for its run. */
export const UPLOAD_RETENTION_MS = 48 * 60 * 60 * 1000;

/** Files Claude uploads for the MCP connector live under this prefix and go
    sooner: the daily cron deletes them once they pass MCP_UPLOAD_RETENTION_MS. */
export const MCP_UPLOAD_PREFIX = "mcp/";
export const MCP_UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Uploads live on the Blob store's own host; generated results do not. */
export function isBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}
