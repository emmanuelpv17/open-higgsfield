import { lookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/* Links pasted into a chat often point at a host's page for a file rather
   than the file itself. The common ones are rewritten to their direct
   download, and every link is checked before a run is paid for. */

/* The check opens links on the server, so it may only reach public hosts:
   never loopback, private, link-local (cloud metadata), CGNAT or reserved
   addresses. IPv4-mapped IPv6 addresses are matched by the IPv4 rules. */
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  BLOCKED.addSubnet(net, prefix, "ipv6");
}
const MAX_REDIRECTS = 5;

function blocked(address: string): boolean {
  return BLOCKED.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

/* The default lookup, refusing a name with any blocked address. The socket
   connects to the address checked here, so the name cannot be re-pointed
   between the check and the connection. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "");
    if (!addresses.length || addresses.some((entry) => blocked(entry.address))) {
      return callback(Object.assign(new Error(`Blocked address for ${hostname}`), { code: "EBLOCKED" }), "");
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

/** Status, type and redirect target of one https link, opened only on a
    public address. Literal IPs skip the lookup, so they are checked here. */
function probe(url: URL, signal: AbortSignal): Promise<{ status: number; type: string; location: string | null }> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.port || (isIP(host) && blocked(host))) {
    return Promise.reject(new Error("Not a public https link"));
  }
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { headers: { Range: "bytes=0-0" }, lookup: publicLookup, agent: false, signal },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          type: (res.headers["content-type"] ?? "").toLowerCase(),
          location: res.headers.location ?? null,
        });
        res.destroy();
      },
    );
    req.on("error", reject);
    req.end();
  });
}

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
  // Its upload API answers with http links, and only https ones are opened.
  if (host === "tmpfiles.org") {
    url.protocol = "https:";
    const match = /^\/(\d+)\/(.+)$/.exec(url.pathname);
    if (match) url.pathname = `/dl/${match[1]}/${match[2]}`;
  }
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    url.searchParams.delete("dl");
    url.searchParams.set("raw", "1");
  }
  return url.toString();
}

/** Null when the link answers with media of the expected kind, otherwise a
    Spanish explanation. A server that does not say what it sends is let
    through; only an HTML page or an unreachable link is refused. Only https
    links to public hosts are opened, each redirect checked again. */
export async function checkMediaUrl(url: string, role: string): Promise<string | null> {
  const expected = KIND_NAME[role] ?? "un archivo";
  const unreachable = `No se pudo abrir el enlace ${url}. Revisa que sea un enlace https público y que no haya vencido.`;
  const signal = AbortSignal.timeout(10_000);
  let response: { status: number; type: string; location: string | null };
  try {
    let current = new URL(url);
    response = await probe(current, signal);
    for (let hops = 0; response.status >= 300 && response.status < 400 && response.location; hops++) {
      if (hops === MAX_REDIRECTS) return unreachable;
      current = new URL(response.location, current);
      response = await probe(current, signal);
    }
  } catch {
    return unreachable;
  }
  if (response.status < 200 || response.status >= 300) {
    return `El enlace ${url} respondió con error ${response.status}; puede que haya vencido o no sea público.`;
  }
  const type = response.type;
  if (type.startsWith("text/html")) {
    return `El enlace ${url} abre una página web, no ${expected}. Usa el enlace de descarga directa del archivo.`;
  }
  const prefix = KIND_PREFIX[role];
  if (prefix && /^(image|video|audio)\//.test(type) && !type.startsWith(prefix)) {
    return `El enlace ${url} es ${type.split("/")[0] === "image" ? "una imagen" : type.split("/")[0] === "video" ? "un video" : "un audio"}, pero aquí se esperaba ${expected}.`;
  }
  return null;
}
