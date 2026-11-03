/* The result viewer Claude shows inline (an MCP App): a sandboxed page that
   receives each generate / show_result result from the host and shows
   the images or the video in the chat itself, rather than as links. While a
   run is still rendering it asks check_generation again on its own, so the
   tile fills in when the result lands. It speaks the MCP Apps postMessage
   protocol directly; nothing is loaded from outside. */

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
  /* What generate was asked, shown above the result; checks carry none and
     the viewer keeps what it already has. */
  prompt?: string;
  /** Short labels: model, aspect ratio, duration, resolution, audio. */
  chips?: string[];
  /** "9:16" and the like, to size the waiting placeholder. */
  aspect?: string;
  /** generate's arguments for the run, with stored links instead of inline
      files, so the viewer's "Recrear" can run it again. */
  rerun?: { model: string; prompt: string; settings: Record<string, unknown>; media: Record<string, string | string[]> };
};

export const VIEWER_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; --bg: transparent; --fg: #1a1a1a; --muted: #6b6b6b; --card: #f4f3ef; --line: #e2e0d8; --accent: #1a1a1a; --soft: rgba(128, 128, 128, 0.14); }
  :root[data-theme="dark"] { --fg: #ecebe6; --muted: #a3a29c; --card: #262624; --line: #3a3936; --accent: #ecebe6; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  /* Laid out like Higgsfield's own result: the prompt, a row of chips, the
     media at its own shape on the left, and the actions under it. */
  .box { padding: 4px 2px 6px; }
  .prompt { font-size: 13px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .prompt.open { display: block; }
  .more { margin-top: 2px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; color: var(--muted); cursor: pointer; }
  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0; }
  .chip { padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .state { margin-left: auto; font-size: 11px; color: var(--muted); }
  .grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .media { max-width: 100%; border-radius: 12px; overflow: hidden; background: #000; }
  /* A fixed cap, not vh: inline, vh is the frame's own height, which starts
     small and would keep a vertical video a sliver. Fullscreen fills the view. */
  .media img, .media video { display: block; width: auto; max-width: 100%; height: auto; max-height: 400px; }
  .grid.many .media img { max-height: 240px; }
  :root.full .media img, :root.full .media video { max-height: calc(100vh - 140px); }
  video::-webkit-media-controls-fullscreen-button { display: none; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; border: 0; border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: var(--soft); color: var(--fg); }
  .btn.primary { background: #d2f34c; color: #111; }
  .hold { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; max-width: 100%; padding: 16px; border-radius: 12px; background: var(--soft); color: var(--muted); font-size: 12px; text-align: center; }
  .spin { width: 22px; height: 22px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: r 0.9s linear infinite; }
  @keyframes r { to { transform: rotate(360deg); } }
  .err { padding: 10px 0; color: #c0392b; }
  .note { font-size: 12px; }
  .wait { padding: 28px 12px 32px; text-align: center; color: var(--muted); }
</style>
</head>
<body>
<div id="app" class="box"><div class="wait"><div class="spin"></div>Cargando…</div></div>
<script>
(function () {
  var nextId = 1, pending = {}, payload = null, timer = null, started = 0, misses = 0, stopped = "";
  var app = document.getElementById("app");

  function send(msg) { window.parent.postMessage(msg, "*"); }
  /* A host that never answers must not leave the tile waiting on it forever. */
  function request(method, params, timeoutMs) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      if (timeoutMs) setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error("timeout")); } }, timeoutMs);
    });
  }
  function notify(method, params) { send({ jsonrpc: "2.0", method: method, params: params || {} }); }

  function applyTheme(ctx) {
    if (ctx && (ctx.theme === "dark" || ctx.theme === "light")) document.documentElement.setAttribute("data-theme", ctx.theme);
    if (ctx && ctx.displayMode) setFull(ctx.displayMode === "fullscreen");
  }
  var full = false;
  function fsLabel() { return full ? "\u2715" : "\u26F6"; }
  function fsTitle() { return full ? "Salir" : "Pantalla completa"; }
  function setFull(on) {
    full = on;
    document.documentElement.classList.toggle("full", on);
    Array.prototype.forEach.call(document.querySelectorAll(".fs"), function (b) { b.textContent = fsLabel() + " " + fsTitle(); });
    resize();
  }
  /* The host's frame does not allow the video's own fullscreen button, so
     the viewer asks the host for its fullscreen mode, and falls back to the
     browser's if the host has none. */
  function toggleFull(node) {
    request("ui/request-display-mode", { mode: full ? "inline" : "fullscreen" }, 5000)
      .then(function (r) { setFull(!!r && r.mode === "fullscreen"); })
      .catch(function () {
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
        else if (node.requestFullscreen) node.requestFullscreen().catch(function () {});
      });
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
  function mediaTile(node) {
    var wrap = el("div", "media");
    wrap.appendChild(node);
    return wrap;
  }
  function button(cls, text, title, onclick) {
    var b = el("button", "btn " + cls, text);
    if (title) { b.title = title; b.setAttribute("aria-label", title); }
    b.onclick = onclick;
    return b;
  }
  var promptOpen = false;
  /* The prompt, clamped to two lines with "Ver más", then the chips and the
     run's state. */
  function header(p) {
    if (p.prompt) {
      var text = el("div", "prompt" + (promptOpen ? " open" : ""), p.prompt);
      app.appendChild(text);
      if (p.prompt.length > 160) {
        var more = el("button", "more", promptOpen ? "Ver menos" : "Ver más");
        more.onclick = function () { promptOpen = !promptOpen; render(payload); };
        app.appendChild(more);
      }
    }
    var chips = el("div", "chips");
    (p.chips && p.chips.length ? p.chips : [p.heading || "Higgsfield"]).forEach(function (c) { chips.appendChild(el("span", "chip", c)); });
    chips.appendChild(el("span", "state", p.status === "completed" ? "Listo" : p.status === "queued" ? "En cola" : p.status === "in_progress" || p.status === "unknown" ? "Generando…" : ""));
    app.appendChild(chips);
  }
  /* A waiting box shaped like the result will be, from its aspect ratio. */
  function holdSize(aspect) {
    var m = /^(\\d+):(\\d+)$/.exec(aspect || "");
    var w = m ? Number(m[1]) : 16, h = m ? Number(m[2]) : 9;
    var height = Math.min(400, Math.round(320 * h / w));
    return { width: Math.round(height * w / h), height: height };
  }

  function render(p) {
    app.textContent = "";
    header(p);
    var video = safe(p.video), images = (p.images || []).map(safe).filter(Boolean);
    if (p.status === "completed" && (video || images.length)) {
      var grid = el("div", "grid" + (!video && images.length > 1 ? " many" : ""));
      var first = null;
      if (video) {
        var v = el("video"); v.src = video; v.controls = true; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
        /* The frame cannot go fullscreen itself; the button below does it. */
        v.setAttribute("controlsList", "nofullscreen"); v.onloadedmetadata = resize;
        grid.appendChild(mediaTile(v));
        first = v;
      }
      images.slice(0, 4).forEach(function (src) {
        var img = el("img"); img.src = src; img.alt = "Resultado"; img.onload = resize;
        grid.appendChild(mediaTile(img));
        if (!first) first = img;
      });
      app.appendChild(grid);
      var acts = el("div", "acts");
      (video ? [video] : images.slice(0, 4)).forEach(function (url, i, all) {
        acts.appendChild(button("primary", "\u2913 Descargar" + (all.length > 1 ? " " + (i + 1) : ""), "", function () { download(url); }));
      });
      if (p.rerun) acts.appendChild(button("re", "\u21BB Recrear", "Generar otra vez con lo mismo (gasta saldo)", function () { recreate(this); }));
      acts.appendChild(button("fs", fsLabel() + " " + fsTitle(), "", function () { toggleFull(first); }));
      app.appendChild(acts);
    } else if (p.status === "queued" || p.status === "in_progress" || p.status === "unknown") {
      if (!started) started = Date.now();
      var minutes = Math.floor((Date.now() - started) / 60000);
      var size = holdSize(p.aspect);
      var w = el("div", "hold");
      w.style.width = size.width + "px"; w.style.minHeight = size.height + "px";
      if (!stopped) w.appendChild(el("div", "spin"));
      /* Queued: the run has not started. Briefly, that is normal; for long,
         the API key's concurrency is full and it waits for another run. */
      var queued = p.status === "queued";
      w.appendChild(document.createTextNode(
        stopped ? (queued ? "Sigue en cola en Higgsfield." : "Sigue generándose en Higgsfield.")
          : (queued ? "En cola: esperando turno en Higgsfield. Si dura mucho, otro video de tu cuenta de la API sigue en proceso." : "Generando… se actualiza solo cuando esté listo.") + (minutes ? " (" + minutes + " min)" : "")
      ));
      if (stopped) w.appendChild(el("div", "note", stopped));
      app.appendChild(w);
      schedule();
    } else {
      app.appendChild(el("div", "err", p.error || "No se entregó el resultado."));
    }
    resize();
  }

  /* A run still rendering is asked about again every 8 s, easing to 20 s,
     for up to an hour. If the chat stops answering, or the hour runs out,
     the tile says so and points the user to Claude instead of spinning on. */
  var ASK_CLAUDE = "Claude te lo muestra cuando esté listo; si no lo hace, escríbele «revisa el video».";
  function schedule() {
    if (timer || stopped || !payload || !payload.requestId) return;
    if (Date.now() - started > 60 * 60000) return stop("Lleva más de una hora. " + ASK_CLAUDE);
    var delay = Math.min(20000, 8000 + Math.floor((Date.now() - started) / 60000) * 1000);
    timer = setTimeout(function () {
      timer = null;
      request("tools/call", { name: "check_generation", arguments: { request_id: payload.requestId, wait: false } }, 30000)
        .then(function (result) { misses = 0; take(result); })
        .catch(function () {
          if (++misses >= 3) stop("Este recuadro no puede actualizarse solo aquí. " + ASK_CLAUDE);
          else schedule();
        });
    }, delay);
  }
  /* Runs generate again with the same arguments, through the host, which
     asks the user to approve it like any spend. The new run takes over this
     tile: its own result, or its progress and polling. */
  function recreate(btn) {
    if (!payload || !payload.rerun) return;
    btn.disabled = true; btn.textContent = "Recreando…";
    request("tools/call", { name: "generate", arguments: payload.rerun }, 70000)
      .then(function (result) {
        if (!result || result.isError) throw new Error("refused");
        if (timer) { clearTimeout(timer); timer = null; }
        started = 0; misses = 0; stopped = "";
        take(result);
      })
      .catch(function () { btn.disabled = false; btn.textContent = "\u21BB Recrear"; });
  }
  function stop(why) {
    stopped = why;
    if (payload) render(payload);
  }

  function take(result) {
    var p = result && result.structuredContent;
    if (!p || typeof p !== "object" || !("status" in p)) return;
    /* A check carries only the status and the media; the rest stays. */
    if (payload) {
      if (!p.heading) p.heading = payload.heading;
      if (!p.prompt) p.prompt = payload.prompt;
      if (!p.chips || !p.chips.length) p.chips = payload.chips;
      if (!p.aspect) p.aspect = payload.aspect;
      if (!p.rerun) p.rerun = payload.rerun;
    }
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

  /* A host that never hands this tile its tool result would leave it on
     "Cargando…" for good; after a while it says where the result will be. */
  setTimeout(function () {
    if (payload) return;
    app.textContent = "";
    app.appendChild(el("div", "wait", "Claude te mostrará el resultado aquí en el chat cuando esté listo."));
    resize();
  }, 20000);

  /* Claude only grants fullscreen to an app that declares it here. */
  request("ui/initialize", {
    appInfo: { name: "open-higgsfield-viewer", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    protocolVersion: "2026-01-26",
  }, 5000)
    .then(function (r) { applyTheme(r && r.hostContext); notify("ui/notifications/initialized"); resize(); })
    .catch(function () { notify("ui/notifications/initialized"); });
})();
</script>
</body>
</html>`;

/* Hosts cache a viewer by its URI, so a fixed URI kept showing the first
   viewer they fetched after it changed. The URI carries a hash of the HTML,
   so every change is fetched afresh. */
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
}

export const VIEWER_URI = `ui://open-higgsfield/result-${hashOf(VIEWER_HTML)}.html`;
/** The URI before it was versioned. Tool lists a host still holds point
    here, so it serves the current viewer too. */
export const LEGACY_VIEWER_URI = "ui://open-higgsfield/result.html";
