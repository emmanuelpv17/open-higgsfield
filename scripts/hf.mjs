#!/usr/bin/env node
// CLI for the Higgsfield platform API (https://docs.higgsfield.ai).
//
// Credentials come from the environment, or from .env.local (gitignored):
//   HF_API_KEY=id:secret            or   HF_API_KEY_ID=... + HF_API_KEY_SECRET=...
//
// Usage:
//   node scripts/hf.mjs gen <model-path> --prompt "..." [key=value ...] [--out dir] [--no-wait]
//   node scripts/hf.mjs estimate <model-path> --prompt "..." [key=value ...]
//   node scripts/hf.mjs status <request_id> [--out dir]
//   node scripts/hf.mjs cancel <request_id>
//   node scripts/hf.mjs upload <file>
//
// key=value pairs become JSON body fields. Values are parsed as JSON when
// possible (5 -> number, true -> boolean, ["a"] -> array), otherwise strings.
// A value pointing at a local file (e.g. image_url=./foto.jpg) is uploaded
// first and replaced by its public URL.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const BASE_URL = (process.env.HF_API_BASE_URL || "https://api.higgsfield.ai").replace(/\/$/, "");
const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);
const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

loadEnvFile(resolve(process.cwd(), ".env.local"));

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function authHeader() {
  let key = process.env.HF_API_KEY;
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  // Some environments store the whole "id:secret" pair in the ID variable.
  if (!key && id?.includes(":")) key = id;
  if (!key && id && secret) key = `${id}:${secret}`;
  if (!key || !key.includes(":")) {
    fail("Missing credentials: set HF_API_KEY=id:secret (or HF_API_KEY_ID + HF_API_KEY_SECRET) in .env.local");
  }
  return `Key ${key.trim()}`;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function api(method, path, body) {
  const response = await fetch(path.startsWith("http") ? path : `${BASE_URL}/${path.replace(/^\//, "")}`, {
    method,
    headers: {
      Authorization: authHeader(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  if (!response.ok) {
    const detail = typeof payload === "object" && payload ? JSON.stringify(payload.detail ?? payload) : payload;
    fail(`${method} ${path} -> ${response.status}: ${detail}`);
  }
  return payload;
}

async function upload(file) {
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()];
  if (!contentType) fail(`Unsupported file type: ${file}`);
  const target = await api("POST", "files/generate-upload-url", { content_type: contentType });
  const response = await fetch(target.upload_url, {
    method: "PUT",
    headers: target.upload_headers ?? { "Content-Type": contentType },
    body: readFileSync(file),
  });
  if (!response.ok) fail(`Upload of ${file} failed: ${response.status}`);
  console.error(`uploaded ${file} -> ${target.public_url}`);
  return target.public_url;
}

function parseArgs(argv) {
  const flags = {};
  const fields = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (name.startsWith("no-")) flags[name.slice(3)] = false;
      else flags[name] = argv[++i];
    } else if (/^[a-zA-Z_][\w]*=/.test(arg)) {
      const eq = arg.indexOf("=");
      fields[arg.slice(0, eq)] = parseValue(arg.slice(eq + 1));
    } else {
      positional.push(arg);
    }
  }
  return { flags, fields, positional };
}

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function resolveLocalFiles(value) {
  if (Array.isArray(value)) return Promise.all(value.map(resolveLocalFiles));
  if (typeof value === "string" && !/^https?:\/\//.test(value) && existsSync(value)) return upload(value);
  return value;
}

async function buildBody(flags, fields) {
  const body = {};
  if (flags.prompt) body.prompt = flags.prompt;
  for (const [key, value] of Object.entries(fields)) body[key] = await resolveLocalFiles(value);
  return body;
}

async function waitFor(requestId) {
  let delay = 2000;
  const deadline = Date.now() + 20 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const status = await api("GET", `requests/${encodeURIComponent(requestId)}/status`);
    if (status.status !== last) console.error(`status: ${(last = status.status)}`);
    if (TERMINAL.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
    delay = Math.min(delay * 1.5, 10_000);
  }
  fail(`Timed out waiting for ${requestId}; check later with: node scripts/hf.mjs status ${requestId}`);
}

function outputUrls(status) {
  const urls = [];
  for (const item of status.images ?? []) if (item?.url) urls.push(item.url);
  if (status.video?.url) urls.push(status.video.url);
  for (const item of status.audios ?? []) if (item?.url) urls.push(item.url);
  if (!status.audios && status.audio?.url) urls.push(status.audio.url);
  return urls;
}

async function download(status, outDir) {
  mkdirSync(outDir, { recursive: true });
  const saved = [];
  for (const [index, url] of outputUrls(status).entries()) {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`could not download ${url}: ${response.status}`);
      continue;
    }
    const ext = extname(new URL(url).pathname) || ".bin";
    const file = join(outDir, `${status.request_id}-${index}${ext}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    saved.push(file);
  }
  return saved;
}

async function finish(status, flags) {
  console.log(JSON.stringify(status, null, 2));
  if (status.status !== "completed") process.exit(2);
  const saved = await download(status, flags.out ?? "outputs");
  for (const file of saved) console.error(`saved ${file}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags, fields, positional } = parseArgs(rest);

  switch (command) {
    case "gen": {
      const [model] = positional;
      if (!model) fail("Usage: gen <model-path> --prompt \"...\" [key=value ...]");
      const body = await buildBody(flags, fields);
      console.error(`POST /${model} ${JSON.stringify(body)}`);
      const queued = await api("POST", model, body);
      console.error(`request_id: ${queued.request_id}`);
      if (flags.wait === false) return console.log(JSON.stringify(queued, null, 2));
      return finish(await waitFor(queued.request_id), flags);
    }
    case "estimate": {
      const [model] = positional;
      if (!model) fail("Usage: estimate <model-path> --prompt \"...\" [key=value ...]");
      return console.log(JSON.stringify(await api("POST", `estimate/${model}`, await buildBody(flags, fields)), null, 2));
    }
    case "status": {
      const [requestId] = positional;
      if (!requestId) fail("Usage: status <request_id>");
      const status = await api("GET", `requests/${encodeURIComponent(requestId)}/status`);
      if (TERMINAL.has(status.status)) return finish(status, flags);
      return console.log(JSON.stringify(status, null, 2));
    }
    case "cancel": {
      const [requestId] = positional;
      if (!requestId) fail("Usage: cancel <request_id>");
      await api("POST", `requests/${encodeURIComponent(requestId)}/cancel`);
      return console.log("canceled");
    }
    case "upload": {
      const [file] = positional;
      if (!file) fail("Usage: upload <file>");
      return console.log(await upload(file));
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 18).join("\n").replace(/^\/\/ ?/gm, ""));
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
