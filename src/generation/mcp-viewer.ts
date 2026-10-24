/* The result viewer Claude shows inline (an MCP App): a sandboxed page that
   receives each generate / check_generation result from the host and shows
   the images or the video in the chat itself, rather than as links. While a
   run is still rendering it asks check_generation again on its own, so the
   tile fills in when the result lands. It speaks the MCP Apps postMessage
   protocol directly; nothing is loaded from outside. */

export const VIEWER_URI = "ui://open-higgsfield/result.html";
export const VIEWER_MIME = "text/html;profile=mcp-app";

/** Hosts the viewer may load media from: the platform's CDN and this
    deployment's Blob store (uploads, and anything copied there). */
export function viewerResourceDomains(): string[] {
  const domains = ["https://*.cloudfront.net", "https://*.higgsfield.ai"];
  const storeId = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN?.split("_")[3];
  if (storeId) domains.push(`https://${storeId}.public.blob.vercel-storage.com`);
  return domains;
}

/** What the viewer reads from a tool result's structuredContent. */
export type ViewerPayload = {
  requestId: string;
  status: string;
  heading: string;
  images: string[];
  video: string | null;
  error: string | null;
};

export const VIEWER_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --bg: transparent; --fg: #1a1a1a; --muted: #6b6b6b; --card: #f4f3ef; --line: #e2e0d8; --accent: #1a1a1a; }
  :root[data-theme="dark"] { --fg: #ecebe6; --muted: #a3a29c; --card: #262624; --line: #3a3936; --accent: #ecebe6; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .box { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--card); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; }
  .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { color: var(--muted); font-size: 12px; }
  .grid { display: grid; gap: 4px; padding: 0 4px 4px; }
  .grid.n2 { grid-template-columns: 1fr 1fr; }
  .grid.n3, .grid.n4 { grid-template-columns: 1fr 1fr; }
  .media { position: relative; border-radius: 10px; overflow: hidden; background: #0001; }
  .media img, .media video { display: block; width: 100%; height: auto; max-height: 70vh; object-fit: contain; background: #000; }
  .dl { position: absolute; right: 8px; bottom: 8px; border: 0; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: #000a; color: #fff; backdrop-filter: blur(4px); }
  .wait { padding: 28px 12px 32px; text-align: center; color: var(--muted); }
  .spin { width: 22px; height: 22px; margin: 0 auto 10px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: r 0.9s linear infinite; }
  @keyframes r { to { transform: rotate(360deg); } }
  .err { padding: 14px 12px 16px; color: #c0392b; }
</style>
</head>
<body>
<div id="app" class="box"><div class="wait"><div class="spin"></div>Cargando…</div></div>
<script>
(function () {
  var nextId = 1, pending = {}, payload = null, polls = 0, timer = null;
  var app = document.getElementById("app");

  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method: method, params: params || {} }); }

  function applyTheme(ctx) {
    if (ctx && (ctx.theme === "dark" || ctx.theme === "light")) document.documentElement.setAttribute("data-theme", ctx.theme);
  }
  function resize() { notify("ui/notifications/size-changed", { height: Math.ceil(document.documentElement.getBoundingClientRect().height) }); }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function safe(url) { return typeof url === "string" && /^https:\\/\\//.test(url) ? url : null; }

  function download(url) {
    request("ui/download-file", { contents: [{ type: "resource_link", uri: url, name: url.split("/").pop().split("?")[0] || "resultado" }] })
      .then(function (r) { if (r && r.isError) throw new Error("denied"); })
      .catch(function () { request("ui/open-link", { url: url }).catch(function () {}); });
  }
  function mediaTile(node, url) {
    var wrap = el("div", "media");
    wrap.appendChild(node);
    var b = el("button", "dl", "Descargar");
    b.onclick = function () { download(url); };
    wrap.appendChild(b);
    return wrap;
  }

  function render(p) {
    app.textContent = "";
    var head = el("div", "head");
    head.appendChild(el("div", "title", p.heading || "Higgsfield"));
    head.appendChild(el("div", "meta", p.status === "completed" ? "Listo" : p.status === "queued" || p.status === "in_progress" || p.status === "unknown" ? "Generando…" : p.status));
    app.appendChild(head);
    var video = safe(p.video), images = (p.images || []).map(safe).filter(Boolean);
    if (p.status === "completed" && (video || images.length)) {
      var grid = el("div", "grid n" + Math.min(4, video ? 1 : images.length));
      if (video) {
        var v = el("video"); v.src = video; v.controls = true; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
        grid.appendChild(mediaTile(v, video));
      }
      images.slice(0, 4).forEach(function (src) {
        var img = el("img"); img.src = src; img.alt = "Resultado"; img.onload = resize;
        grid.appendChild(mediaTile(img, src));
      });
      app.appendChild(grid);
    } else if (p.status === "queued" || p.status === "in_progress" || p.status === "unknown") {
      var w = el("div", "wait"); w.appendChild(el("div", "spin")); w.appendChild(document.createTextNode("Generando… se actualiza solo cuando esté listo."));
      app.appendChild(w);
      schedule();
    } else {
      app.appendChild(el("div", "err", p.error || "No se entregó el resultado."));
    }
    resize();
  }

  /* A run still rendering is asked about again every 8 s, for up to 15 min. */
  function schedule() {
    if (timer || !payload || !payload.requestId || polls >= 110) return;
    timer = setTimeout(function () {
      timer = null; polls++;
      request("tools/call", { name: "check_generation", arguments: { request_id: payload.requestId } })
        .then(function (result) { take(result); })
        .catch(function () { schedule(); });
    }, 8000);
  }

  function take(result) {
    var p = result && result.structuredContent;
    if (!p || typeof p !== "object" || !("status" in p)) return;
    if (!p.heading && payload && payload.heading) p.heading = payload.heading;
    payload = p;
    render(p);
  }

  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id !== undefined && pending[m.id] && (m.result !== undefined || m.error !== undefined)) {
      var h = pending[m.id]; delete pending[m.id];
      if (m.error) h.reject(m.error); else h.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") take(m.params);
    else if (m.method === "ui/notifications/host-context-changed") applyTheme(m.params);
    else if (m.method === "ui/resource-teardown" && m.id !== undefined) { if (timer) clearTimeout(timer); send({ jsonrpc: "2.0", id: m.id, result: {} }); }
  });

  request("ui/initialize", { appInfo: { name: "open-higgsfield-viewer", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26" })
    .then(function (r) { applyTheme(r && r.hostContext); notify("ui/notifications/initialized"); resize(); })
    .catch(function () { notify("ui/notifications/initialized"); });
})();
</script>
</body>
</html>`;
