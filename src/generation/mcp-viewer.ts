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
  .media { position: relative; max-width: 100%; border-radius: 12px; overflow: hidden; background: #000; }
  /* An image carries its own actions on it, bottom left, as on Higgsfield. */
  .over { position: absolute; left: 8px; bottom: 8px; display: flex; gap: 6px; }
  /* The video's own bar, drawn here so ⛶ can sit between the volume and
     the menu: the browser's bar takes no extra buttons, and its own
     fullscreen is blocked in the host's frame. */
  .bar { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 8px 6px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.7)); color: #fff; }
  .seek { display: block; width: 100%; height: 4px; margin: 0 0 4px; accent-color: #fff; cursor: pointer; }
  .row { display: flex; align-items: center; gap: 2px; }
  .row .time { margin-left: 4px; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .row .gap { flex: 1; }
  .pb { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: none; color: #fff; cursor: pointer; }
  .pb:hover { background: rgba(255, 255, 255, 0.15); }
  .pb svg { width: 18px; height: 18px; fill: currentColor; }
  .menu { position: absolute; right: 8px; bottom: 44px; min-width: 150px; padding: 4px; border-radius: 8px; background: rgba(20, 20, 20, 0.92); }
  .menu button { display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px; background: none; color: #fff; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .menu button:hover { background: rgba(255, 255, 255, 0.12); }
  .ico { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 30px; height: 30px; padding: 0 9px; border: 0; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: rgba(0, 0, 0, 0.55); color: #fff; backdrop-filter: blur(6px); }
  .ico.primary { background: #d2f34c; color: #111; }
  .said { margin-top: 6px; font-size: 12px; color: var(--muted); }
  /* A fixed cap, not vh: inline, vh is the frame's own height, which starts
     small and would keep a vertical video a sliver. Fullscreen fills the view. */
  .media img, .media video { display: block; width: auto; max-width: 100%; height: auto; max-height: 400px; }
  .grid.many .media img { max-height: 240px; }
  :root.full .media img, :root.full .media video { max-height: calc(100vh - 140px); }
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
    Array.prototype.forEach.call(document.querySelectorAll(".ico.fs"), function (b) { b.textContent = fsLabel(); b.title = fsTitle(); });
    Array.prototype.forEach.call(document.querySelectorAll(".pb.fs"), function (b) { setIcon(b, on ? "exit" : "full", on ? "Salir de pantalla completa" : "Pantalla completa"); });
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

  /* First the system's "Save as" dialog, so the user picks the folder and
     name; hosts that keep it from a sandboxed frame get their own download,
     and failing that the link opens. */
  function download(url) {
    var name = url.split("/").pop().split("?")[0] || "resultado";
    var hostDownload = function () {
      request("ui/download-file", { contents: [{ type: "resource_link", uri: url, name: name }] })
        .then(function (r) { if (r && r.isError) throw new Error("denied"); })
        .catch(function () { request("ui/open-link", { url: url }).catch(function () {}); });
    };
    if (!window.showSaveFilePicker) return hostDownload();
    var ext = (name.split(".").pop() || "").toLowerCase();
    var type = ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    var types = [{ description: type.indexOf("video") === 0 ? "Video" : "Imagen", accept: {} }];
    types[0].accept[type] = ["." + (ext || "png")];
    window.showSaveFilePicker({ suggestedName: name, types: types })
      .then(function (handle) {
        return fetch(url).then(function (response) {
          if (!response.ok) throw new Error("fetch");
          return Promise.all([response.blob(), handle.createWritable()]);
        }).then(function (both) { return both[1].write(both[0]).then(function () { return both[1].close(); }); });
      })
      .catch(function (error) {
        /* The user closing the dialog is an answer, not a failure. */
        if (error && error.name === "AbortError") return;
        hostDownload();
      });
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
  function icon(cls, text, title, onclick) {
    var b = el("button", "ico " + cls, text);
    b.title = title; b.setAttribute("aria-label", title);
    b.onclick = onclick;
    return b;
  }
  /* Animar and Editar hand the next step to Claude, as a message in the
     chat, so it can ask for the model or the change before anything is
     spent. A host without ui/message gets the text to send instead. */
  var said = "";
  function ask(text) {
    request("ui/message", { role: "user", content: [{ type: "text", text: text }] }, 5000)
      .then(function (r) { if (r && r.isError) throw new Error("denied"); said = ""; })
      .catch(function () { said = "Escríbele a Claude: «" + text + "»"; if (payload) render(payload); });
  }
  function imageActions(img, url) {
    var over = el("div", "over");
    over.appendChild(icon("primary", "\u25B6 Animar", "Convertir esta imagen en video", function () {
      ask("Anima esta imagen en un video con el conector API Higgsfield MCP. Pregúntame el modelo y el movimiento antes de generar: " + url);
    }));
    over.appendChild(icon("", "\u270E", "Editar esta imagen", function () {
      ask("Quiero editar esta imagen con el conector API Higgsfield MCP. Pregúntame qué cambiar antes de generar: " + url);
    }));
    over.appendChild(icon("", "\u2913", "Descargar", function () { download(url); }));
    over.appendChild(icon("fs", fsLabel(), fsTitle(), function () { toggleFull(img); }));
    return over;
  }
  var SVG = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    sound: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>',
    mute: '<path d="M3 9v6h4l5 5V4L7 9H3zm18.6 3-2.8-2.8-1.4 1.4 2.8 2.8-2.8 2.8 1.4 1.4 2.8-2.8 2.8 2.8 1.4-1.4-2.8-2.8 2.8-2.8-1.4-1.4z"/>',
    full: '<path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/>',
    exit: '<path d="M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/>',
    more: '<path d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  };
  function pb(name, title, onclick) {
    var b = el("button", "pb");
    b.title = title; b.setAttribute("aria-label", title);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + SVG[name] + "</svg>";
    b.onclick = function (event) { event.stopPropagation(); onclick(b); };
    return b;
  }
  function setIcon(b, name, title) {
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + SVG[name] + "</svg>";
    b.title = title; b.setAttribute("aria-label", title);
  }
  function clock(seconds) {
    if (!isFinite(seconds)) seconds = 0;
    var m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  /* Play, seek, time, then volume, ⛶ and ⋮ at the right, as the browser's
     own bar lays them out. */
  function playerBar(v, url) {
    var bar = el("div", "bar");
    var seek = el("input", "seek"); seek.type = "range"; seek.min = "0"; seek.max = "1000"; seek.value = "0";
    seek.setAttribute("aria-label", "Avance");
    seek.oninput = function () { if (v.duration) v.currentTime = (Number(seek.value) / 1000) * v.duration; };
    bar.appendChild(seek);
    var row = el("div", "row");
    var play = pb("pause", "Pausar", function () { if (v.paused) v.play().catch(function () {}); else v.pause(); });
    var time = el("span", "time", "0:00 / 0:00");
    var sound = pb("mute", "Activar sonido", function () { v.muted = !v.muted; });
    var fs = pb("full", "Pantalla completa", function () { toggleFull(v); });
    fs.classList.add("fs");
    var menu = null;
    var more = pb("more", "Más opciones", function () {
      if (menu) { menu.remove(); menu = null; return; }
      menu = el("div", "menu");
      [["Descargar", function () { download(url); }], ["Velocidad 1x", function () { v.playbackRate = 1; }], ["Velocidad 1.5x", function () { v.playbackRate = 1.5; }], ["Velocidad 2x", function () { v.playbackRate = 2; }]].forEach(function (item) {
        var b = el("button", "", item[0]);
        b.onclick = function (event) { event.stopPropagation(); item[1](); menu.remove(); menu = null; };
        menu.appendChild(b);
      });
      bar.parentNode.appendChild(menu);
    });
    row.appendChild(play); row.appendChild(time);
    row.appendChild(el("span", "gap"));
    row.appendChild(sound); row.appendChild(fs); row.appendChild(more);
    bar.appendChild(row);
    function sync() {
      setIcon(play, v.paused ? "play" : "pause", v.paused ? "Reproducir" : "Pausar");
      setIcon(sound, v.muted ? "mute" : "sound", v.muted ? "Activar sonido" : "Silenciar");
      time.textContent = clock(v.currentTime) + " / " + clock(v.duration);
      if (v.duration) seek.value = String(Math.round((v.currentTime / v.duration) * 1000));
    }
    ["play", "pause", "volumechange", "timeupdate", "loadedmetadata"].forEach(function (name) { v.addEventListener(name, sync); });
    v.onclick = function () { if (v.paused) v.play().catch(function () {}); else v.pause(); };
    return bar;
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
        var v = el("video"); v.src = video; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
        v.onloadedmetadata = resize;
        var vtile = mediaTile(v);
        vtile.appendChild(playerBar(v, video));
        grid.appendChild(vtile);
        first = v;
      }
      images.slice(0, 4).forEach(function (src) {
        var img = el("img"); img.src = src; img.alt = "Resultado"; img.onload = resize;
        var tile = mediaTile(img);
        tile.appendChild(imageActions(img, src));
        grid.appendChild(tile);
        if (!first) first = img;
      });
      app.appendChild(grid);
      var acts = el("div", "acts");
      if (video) acts.appendChild(button("primary", "\u2913 Descargar", "", function () { download(video); }));
      if (p.rerun) acts.appendChild(button("re", "\u21BB Recrear", "Generar otra vez con lo mismo (gasta saldo)", function () { recreate(this); }));
      if (acts.childNodes.length) app.appendChild(acts);
      if (said) app.appendChild(el("div", "said", said));
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
