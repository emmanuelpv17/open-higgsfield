/* Links pasted into a chat often point at a host's page for a file rather
   than the file itself. The common ones are rewritten to their direct
   download, and every link is checked before a run is paid for. */

const KIND_PREFIX: Record<string, string> = { start: "image/", end: "image/", reference: "image/", video: "video/", audio: "audio/" };
const KIND_NAME: Record<string, string> = {
  start: "una imagen",
  end: "una imagen",
  reference: "una imagen",
  video: "un video",
  audio: "un audio",
};

/** The direct-download form of a share link, or the link unchanged. */
export function directMediaUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw;
  }
  const host = url.hostname.replace(/^www\./, "");
  // tmpfiles.org/<id>/<name> is a page; tmpfiles.org/dl/<id>/<name> is the file.
  if (host === "tmpfiles.org" && !url.pathname.startsWith("/dl/")) {
    const match = /^\/(\d+)\/(.+)$/.exec(url.pathname);
    if (match) {
      url.pathname = `/dl/${match[1]}/${match[2]}`;
      url.protocol = "https:";
    }
  }
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    url.searchParams.delete("dl");
    url.searchParams.set("raw", "1");
  }
  return url.toString();
}

/** Null when the link answers with media of the expected kind, otherwise a
    Spanish explanation. A server that does not say what it sends is let
    through; only an HTML page or an unreachable link is refused. */
export async function checkMediaUrl(url: string, role: string): Promise<string | null> {
  const expected = KIND_NAME[role] ?? "un archivo";
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return `No se pudo abrir el enlace ${url}. Revisa que sea público y que no haya vencido.`;
  }
  void response.body?.cancel();
  if (!response.ok && response.status !== 206) {
    return `El enlace ${url} respondió con error ${response.status}; puede que haya vencido o no sea público.`;
  }
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  if (type.startsWith("text/html")) {
    return `El enlace ${url} abre una página web, no ${expected}. Usa el enlace de descarga directa del archivo.`;
  }
  const prefix = KIND_PREFIX[role];
  if (prefix && /^(image|video|audio)\//.test(type) && !type.startsWith(prefix)) {
    return `El enlace ${url} es ${type.split("/")[0] === "image" ? "una imagen" : type.split("/")[0] === "video" ? "un video" : "un audio"}, pero aquí se esperaba ${expected}.`;
  }
  return null;
}
