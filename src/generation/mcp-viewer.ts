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
  /** Signed /api/download links by result URL, for hosts that keep the
      viewer from saving files itself. */
  downloads?: Record<string, string>;
  /** generate's arguments for the run, with stored links instead of inline
      files, so the viewer's "Recrear" can run it again. */
  rerun?: { model: string; prompt: string; settings: Record<string, unknown>; media: Record<string, string | string[]> };
};

/** Shown in the waiting tile's diagnostics, to tell which viewer a host
    actually runs; bump it with each viewer change. */
const VIEWER_REVISION = "r58";

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
  /* The ⋮ menu, styled like the browser's own: a white card with icons, and
     a speed list behind "Velocidad de reproducción". */
  .menu { position: absolute; right: 8px; bottom: 46px; z-index: 2; width: 220px; max-width: calc(100% - 16px); max-height: calc(100% - 56px); overflow-y: auto; padding: 6px 0; border-radius: 6px; background: #fff; color: #202124; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); }
  .menu button { display: flex; align-items: center; gap: 14px; width: 100%; padding: 10px 16px; border: 0; background: none; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .menu button:hover, .menu button.on { background: #e8e8e8; }
  .menu svg { flex: none; width: 20px; height: 20px; fill: currentColor; }
  .menu .tick { margin-left: auto; color: #1a73e8; }
  /* Fullscreen: the host's full view when it grants one, else the tile
     itself grown in the chat. Black, the media centered, the bar across. */
  :root.full body, :root.full .box { background: #000; padding: 0; }
  :root.full .prompt, :root.full .more, :root.full .chips, :root.full .acts, :root.full .said, :root.full .over { display: none; }
  :root.full .grid { display: block; }
  :root.full .media { display: flex; align-items: center; justify-content: center; width: 100%; height: 100vh; max-width: none; border-radius: 0; }
  /* Grown in the chat, the frame is as tall as its content, so vh would
     not grow it: a fixed height does. */
  :root.full.theater .media { height: 760px; }
  :root.full .media img, :root.full .media video { width: 100%; height: 100%; max-height: none; object-fit: contain; }
  :root.full .grid .media ~ .media { display: none; }
  /* .ico sets a display of its own, so these name it too to win. */
  .ico.shut { position: absolute; right: 10px; top: 10px; z-index: 2; display: none; }
  :root.full .ico.shut { display: inline-flex; }
  .ico { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 30px; height: 30px; padding: 0 9px; border: 0; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: rgba(0, 0, 0, 0.55); color: #fff; backdrop-filter: blur(6px); }
  .ico.primary { background: #d2f34c; color: #111; }
  .said { margin-top: 6px; font-size: 12px; color: var(--muted); }
  /* A fixed cap, not vh: inline, vh is the frame's own height, which starts
     small and would keep a vertical video a sliver. Fullscreen fills the view. */
  .media img, .media video { display: block; width: auto; max-width: 100%; height: auto; max-height: 400px; }
  .grid.many .media img { max-height: 240px; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; border: 0; border-radius: 8px; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; background: var(--soft); color: var(--fg); }
  .btn.primary { background: #d2f34c; color: #111; }
  .hold { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; max-width: 100%; padding: 16px; border-radius: 12px; background: var(--soft); color: var(--muted); font-size: 12px; text-align: center; }
  .spin { width: 22px; height: 22px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: r 0.9s linear infinite; }
  @keyframes r { to { transform: rotate(360deg); } }
  .err { padding: 10px 0; color: #c0392b; }
  .note { font-size: 12px; }
  .wait { padding: 28px 12px 32px; text-align: center; color: var(--muted); }
  .wait .spin { margin: 0 auto 10px; }
</style>
</head>
<body>
<div id="app" class="box"><div class="wait"><div class="spin"></div>Cargando…</div></div>
<script>
(function () {
  var heard = [];
  var nextId = 1, pending = {}, payload = null, timer = null, started = 0, misses = 0, stopped = "", checked = false;
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
  /* ⛶ grows the tile in the chat itself. The host's full view, which
     Claude desktop sometimes opened in a side panel, is no longer asked
     for; the frame does not allow the browser's fullscreen either. */
  var theater = false;
  function setTheater(on) {
    theater = on;
    document.documentElement.classList.toggle("theater", on);
    setFull(on);
  }
  function toggleFull() {
    /* Back from the host's own full view, if the user opened it there. */
    if (full && !theater) {
      request("ui/request-display-mode", { mode: "inline" }, 5000).then(function () { setFull(false); }).catch(function () { setFull(false); });
      return;
    }
    setTheater(!theater);
  }
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && full && !theater) setFull(false); });
  function resize() { notify("ui/notifications/size-changed", { height: Math.ceil(document.documentElement.getBoundingClientRect().height) }); }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function safe(url) { return typeof url === "string" && /^https:\\/\\//.test(url) ? url : null; }

  /* A file name the user can recognise: the date and the prompt's first
     words, as in "2026-11-03_taza-de-cafe-humeante.mp4". */
  function fileName(url) {
    var ext = ((url.split("?")[0].split("/").pop() || "").split(".").pop() || "png").toLowerCase();
    var words = ((payload && payload.prompt) || "higgsfield").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim().split(" ").slice(0, 5).join("-");
    return new Date().toISOString().slice(0, 10) + "_" + (words || "higgsfield") + "." + ext;
  }
  function mimeOf(name) {
    var ext = name.split(".").pop();
    return ext === "mp4" ? "video/mp4" : ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  }
  /* Saves the file through a "Save as" dialog where the user picks the
     folder and name: the browser's own when the frame allows it, else the
     host's, handed the file itself (a link alone it may open instead). */
  function download(url) {
    var name = fileName(url), type = mimeOf(name);
    /* Each step names itself in the note when all fail, so a host that
       refuses can be told apart from a file the frame could not fetch. */
    var why = [];
    function reason(step) {
      return function (error) {
        var text = error && (error.message || error.code || (error.error && error.error.message)) || String(error);
        why.push(step + ": " + String(text).slice(0, 80));
        throw error;
      };
    }
    var fetched = null;
    /* Last resort, an ordinary download of the fetched file: where the
       host's frame allows downloads, the app shows its own "Save as". A
       blocked one fails without a word, hence the conditional note. */
    function plainSave() {
      if (!fetched) return false;
      var link = document.createElement("a");
      link.href = URL.createObjectURL(fetched);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 60000);
      return true;
    }
    function hostSave() {
      fetch(url)
        .catch(reason("archivo"))
        .then(function (response) { if (!response.ok) throw new Error("archivo: HTTP " + response.status); return response.blob(); })
        .then(function (blob) {
          fetched = blob;
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        })
        .then(function (base64) {
          return request("ui/download-file", { contents: [{ type: "resource", resource: { uri: "file:///" + name, mimeType: type, blob: base64 } }] }, 120000)
            .catch(reason("Claude (archivo)"));
        })
        .then(function (r) { if (r && r.isError) throw new Error("Claude rechazó el archivo"); })
        .catch(function (error) {
          if (why.length === 0 || why[why.length - 1].indexOf("Claude") !== 0) why.push(String((error && error.message) || error).slice(0, 80));
          /* The app's own download link: Claude desktop opens links, and
             this one answers with an attachment, so it shows "Save as". */
          var link = payload && payload.downloads && payload.downloads[url];
          (link
            ? request("ui/open-link", { url: link + "&n=" + encodeURIComponent(name) }, 15000).catch(reason("enlace"))
            : Promise.reject(new Error("sin enlace de descarga")))
            .then(function (r) { if (r && r.isError) { why.push("enlace: rechazado"); throw new Error("denied"); } })
            .catch(function () {
              said = plainSave()
                ? "Si no se abrió la ventana para guardar, este chat no deja descargar desde el recuadro (" + why.join(" · ") + ")."
                : "No se pudo descargar desde aquí (" + why.join(" · ") + ").";
              if (payload) render(payload);
            });
        });
    }
    if (!window.showSaveFilePicker) return hostSave();
    var types = [{ description: type.indexOf("video") === 0 ? "Video" : "Imagen", accept: {} }];
    types[0].accept[type] = ["." + name.split(".").pop()];
    window.showSaveFilePicker({ suggestedName: name, types: types }).catch(reason("Guardar como"))
      .then(function (handle) {
        return fetch(url).then(function (response) {
          if (!response.ok) throw new Error("fetch");
          return Promise.all([response.blob(), handle.createWritable()]);
        }).then(function (both) { return both[1].write(both[0]).then(function () { return both[1].close(); }); });
      })
      .catch(function (error) {
        /* The user closing the dialog is an answer, not a failure. */
        if (error && error.name === "AbortError") return;
        hostSave();
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
    pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
    sound: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
    mute: '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>',
    full: '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>',
    exit: '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>',
    more: '<path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>',
    save: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>',
    speed: '<path d="M13.05 9.79 10 7.5v9l3.05-2.29L16 12zm0 0L10 7.5v9l3.05-2.29L16 12zM11 4.07V2.05c-2.01.2-3.84 1-5.32 2.21L7.1 5.69A7.94 7.94 0 0 1 11 4.07zM5.69 7.1 4.26 5.68A9.95 9.95 0 0 0 2.05 11h2.02c.18-1.46.76-2.79 1.62-3.9zM4.07 13H2.05c.2 2.01 1 3.84 2.21 5.32l1.43-1.43A7.87 7.87 0 0 1 4.07 13zm1.61 6.74A9.98 9.98 0 0 0 11 21.95v-2.02a7.94 7.94 0 0 1-3.9-1.62l-1.42 1.43zM22 12c0 5.16-3.92 9.42-8.95 9.95v-2.02C16.97 19.41 20 16.05 20 12s-3.03-7.41-6.95-7.93V2.05C18.08 2.58 22 6.84 22 12z"/>',
    pip: '<path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/>',
    back: '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>',
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
    function closeMenu() { if (menu) { menu.remove(); menu = null; } }
    function entry(iconName, text, onclick, extra) {
      var b = el("button");
      if (iconName) b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + SVG[iconName] + "</svg>";
      b.appendChild(el("span", "", text));
      if (extra) b.appendChild(extra);
      b.onclick = function (event) { event.stopPropagation(); onclick(); };
      return b;
    }
    function openMenu(page) {
      closeMenu();
      menu = el("div", "menu");
      if (page === "speed") {
        menu.appendChild(entry("back", "Opciones", function () { openMenu("main"); }));
        [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach(function (rate) {
          var on = v.playbackRate === rate;
          var b = entry("", rate === 1 ? "Normal" : String(rate).replace(".", ","), function () { v.playbackRate = rate; closeMenu(); }, on ? el("span", "tick", "\u2713") : null);
          if (on) b.classList.add("on");
          menu.appendChild(b);
        });
      } else {
        menu.appendChild(entry("save", "Descargar", function () { closeMenu(); download(url); }));
        menu.appendChild(entry("speed", "Velocidad de reproducción", function () { openMenu("speed"); }));
        if (document.pictureInPictureEnabled && v.requestPictureInPicture) {
          menu.appendChild(entry("pip", "Pantalla en pantalla", function () {
            closeMenu();
            (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(function () {});
          }));
        }
      }
      bar.parentNode.appendChild(menu);
    }
    var more = pb("more", "Más opciones", function () { if (menu) closeMenu(); else openMenu("main"); });
    document.addEventListener("click", function () { closeMenu(); });
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
        /* Fullscreen hides the image's actions; this ✕ brings it back. */
        tile.appendChild(icon("shut", "\u2715", "Salir de pantalla completa", function () { toggleFull(img); }));
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
      /* A run the tile cannot recover is not an error of the run itself. */
      app.appendChild(el("div", p.status === "gone" ? "wait" : "err", p.error || "No se entregó el resultado."));
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
    /* The first check runs at once: a chat reopened later replays the state
       the run had then, which may long be finished. */
    var delay = checked ? Math.min(20000, 8000 + Math.floor((Date.now() - started) / 60000) * 1000) : 300;
    checked = true;
    timer = setTimeout(function () {
      timer = null;
      request("tools/call", { name: "check_generation", arguments: { request_id: payload.requestId, wait: false } }, 20000)
        .then(function (result) {
          /* A lookup with no note is a run from before notes were kept: say
             so at once instead of showing it as rendering. */
          if (result && result.isError && String(payload.requestId).indexOf("lookup:") === 0) {
            payload = Object.assign({}, payload, { status: "gone", error: "Este resultado se generó antes de que el recuadro pudiera recuperarlo al reabrir el chat. Míralo o descárgalo con el enlace que Claude dejó en el chat." });
            render(payload);
            return;
          }
          /* Any other failed check counts as a miss rather than replaying
             the same request for an hour. */
          if (!result || result.isError) throw new Error("check failed");
          misses = 0; take(result);
        })
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

  /* A chat restored later may hand back only the reply's text, without
     its structuredContent. The text still names the request, so the tile
     can ask for the result again: it shows the run as rendering, and its
     first check, which runs at once, brings the media back. */
  function fromText(result) {
    var block = result && Array.isArray(result.content) && result.content.filter(function (c) { return c && c.type === "text"; })[0];
    var text = block && typeof block.text === "string" ? block.text : "";
    var id = /request_id: (\\S+)/.exec(text);
    if (!id) return null;
    var label = /^(.+?) · approx\\. cost/.exec(text);
    return { requestId: id[1], status: "unknown", heading: label ? label[1] : "", images: [], video: null, error: null };
  }
  /* Claude desktop restores a reopened chat's tile with generate's
     arguments but no usable result: the tile asks for the run those
     arguments started ("lookup:" plus their base64 JSON). */
  var toolArgs = null;
  function fromArgs() {
    if (!toolArgs || typeof toolArgs !== "object") return null;
    var json = JSON.stringify(toolArgs);
    var encoded = btoa(unescape(encodeURIComponent(json)));
    return { requestId: "lookup:" + encoded, status: "unknown", heading: "", images: [], video: null, error: null, prompt: typeof toolArgs.prompt === "string" ? toolArgs.prompt : "" };
  }
  function take(result) {
    var p = result && result.structuredContent;
    if (!p || typeof p !== "object" || !("status" in p)) p = fromText(result) || fromArgs();
    if (!p) return;
    /* A check carries only the status and the media; the rest stays. */
    if (payload) {
      if (!p.heading) p.heading = payload.heading;
      if (!p.prompt) p.prompt = payload.prompt;
      if (!p.chips || !p.chips.length) p.chips = payload.chips;
      if (!p.aspect) p.aspect = payload.aspect;
      if (!p.rerun) p.rerun = payload.rerun;
      if (!p.downloads) p.downloads = payload.downloads;
    }
    payload = p;
    render(p);
  }

  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method === "ui/notifications/tool-input" && m.params && m.params.arguments) toolArgs = m.params.arguments;
    if (m.method) heard.push(m.method.replace("ui/notifications/", "") + (m.method === "ui/notifications/tool-result" ? "[" + Object.keys(m.params || {}).join(",") + "]" : ""));
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
    var wait = el("div", "wait", "Claude te mostrará el resultado aquí en el chat cuando esté listo.");
    /* Which viewer runs and what the host sent it, for a tile that got
       nothing to show. */
    wait.appendChild(el("div", "note", "(recuadro ${VIEWER_REVISION} · recibido: " + (heard.length ? heard.slice(0, 6).join(", ") : "nada") + ")"));
    app.appendChild(wait);
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
