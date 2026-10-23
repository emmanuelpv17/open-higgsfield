import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { PLATFORM_KEY_COOKIE, decodeCredentials } from "@/generation/credentials";
import { PlatformError, createPlatformClient } from "@/generation/platform";
import { UPLOAD_LIMITS, uploadKindOf } from "@/generation/upload-limits";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_OPTIONS,
  blobPathname,
  resolveDeviceId,
} from "@/generation/device";

// Uploads land in the deployment owner's store, so a token is only issued to a
// browser that has saved a platform key the platform accepts, for a file type
// and size the studio takes. The completion callback comes from Vercel and is
// not gated.

export async function POST(request: Request): Promise<NextResponse> {
  const incoming = (await request.json()) as HandleUploadBody;
  if (incoming.type === "blob.generate-client-token") {
    const refusal = await refuseUpload(incoming.payload.pathname);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }
  const device =
    incoming.type === "blob.generate-client-token" ? await readDeviceId() : null;
  const body = device ? withDevicePath(incoming, device.deviceId) : incoming;
  console.info("[blob] upload", summarizeBlobEvent(body));

  try {
    const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
    if (!token) throw new Error("Missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN");
    const json = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname) => {
        console.info("[blob] token", { pathname });
        const kind = uploadKindOf(pathname);
        if (!kind) throw new Error(`Refused upload type: ${pathname}`);
        const limit = UPLOAD_LIMITS[kind];
        return {
          allowedContentTypes: limit.types,
          maximumSizeInBytes: limit.maxBytes,
          addRandomSuffix: true,
        };
      },
    });
    return withDeviceCookie(
      json.type === "blob.generate-client-token" && body.type === "blob.generate-client-token"
        ? NextResponse.json({ ...json, pathname: body.payload.pathname })
        : NextResponse.json(json),
      device,
    );
  } catch (error) {
    console.error("[blob] upload failed", error instanceof Error ? error.message : error);
    if (device?.minted) return withDeviceCookie(new NextResponse(null, { status: 500 }), device);
    throw error;
  }
}

async function refuseUpload(pathname: string): Promise<{ error: string; status: number } | null> {
  const jar = await cookies();
  const credentials = decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value);
  if (!credentials) {
    return { error: "Agrega tu clave API antes de subir archivos", status: 401 };
  }
  if (!uploadKindOf(pathname)) {
    return {
      error: "Tipo de archivo no permitido. Usa imágenes JPG, PNG, WEBP o GIF, video MP4 o MOV, o audio WAV o MP3",
      status: 400,
    };
  }
  try {
    if (!(await keyWorks(credentials.apiKey))) {
      return { error: "Clave API inválida o vencida", status: 401 };
    }
  } catch (error) {
    if (error instanceof PlatformError) {
      return { error: error.message, status: error.status === 429 ? 429 : 502 };
    }
    console.error("[blob] key check failed", error instanceof Error ? error.message : error);
    return { error: "No se pudo verificar la clave API. Intenta de nuevo", status: 503 };
  }
  return null;
}

/* The cookie only has the shape of a key, so the key is tried once on a cheap
   read of its own Soul IDs. Only a 401 refuses it; a 403 (a plan without Soul
   IDs) or a 402 (no balance) still shows the platform knows the key, so it
   counts as a yes. One that works is remembered for a while, by its hash, so
   each upload does not pay a platform round trip. Any other answer, which says
   nothing about the key, or none within a few seconds, throws, and no token
   is issued. */
const KEY_CHECK_TTL_MS = 10 * 60 * 1000;
const KEY_CHECK_TIMEOUT_MS = 5_000;
const workingKeys = new Map<string, number>();

async function keyWorks(apiKey: string): Promise<boolean> {
  const digest = await sha256(apiKey);
  if ((workingKeys.get(digest) ?? 0) > Date.now()) return true;
  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL");
  const timed: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS) });
  try {
    await createPlatformClient({ apiKey, baseUrl, fetch: timed }).get("/v1/custom-references/list?page=1&page_size=1");
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) return false;
    if (!(error instanceof PlatformError && (error.status === 403 || error.status === 402))) throw error;
  }
  if (workingKeys.size > 1000) workingKeys.clear();
  workingKeys.set(digest, Date.now() + KEY_CHECK_TTL_MS);
  return true;
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readDeviceId() {
  const jar = await cookies();
  return resolveDeviceId(jar.get(DEVICE_COOKIE)?.value);
}

function withDeviceCookie(
  response: NextResponse,
  device: { deviceId: string; minted: boolean } | null,
) {
  if (device?.minted) response.cookies.set(DEVICE_COOKIE, device.deviceId, DEVICE_COOKIE_OPTIONS);
  return response;
}

function withDevicePath(body: HandleUploadBody, deviceId: string): HandleUploadBody {
  if (body.type !== "blob.generate-client-token") return body;
  return {
    ...body,
    payload: { ...body.payload, pathname: blobPathname(deviceId, body.payload.pathname) },
  };
}

function summarizeBlobEvent(body: HandleUploadBody) {
  if (body.type === "blob.generate-client-token") {
    return { type: body.type, pathname: body.payload.pathname };
  }
  return { type: body.type, url: body.payload.blob.url };
}
