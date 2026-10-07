import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { PLATFORM_KEY_COOKIE, decodeCredentials } from "@/generation/credentials";
import { UPLOAD_LIMITS, uploadKindOf } from "@/generation/upload-limits";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_OPTIONS,
  blobPathname,
  resolveDeviceId,
} from "@/generation/device";

// Uploads land in the deployment owner's store, so a token is only issued to a
// browser that has saved a platform key, for a file type and size the studio
// takes. The completion callback comes from Vercel and is not gated.

export async function POST(request: Request): Promise<NextResponse> {
  const incoming = (await request.json()) as HandleUploadBody;
  if (incoming.type === "blob.generate-client-token") {
    const refusal = await refuseUpload(incoming.payload.pathname);
    if (refusal) return NextResponse.json({ error: refusal }, { status: refusal.startsWith("Agrega") ? 401 : 400 });
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
        const limit = UPLOAD_LIMITS[uploadKindOf(pathname) ?? "image"];
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

async function refuseUpload(pathname: string): Promise<string | null> {
  const jar = await cookies();
  if (!decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value)) {
    return "Agrega tu clave API antes de subir archivos";
  }
  if (!uploadKindOf(pathname)) {
    return "Tipo de archivo no permitido. Usa imágenes JPG, PNG, WEBP o GIF, video MP4 o MOV, o audio WAV o MP3";
  }
  return null;
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
