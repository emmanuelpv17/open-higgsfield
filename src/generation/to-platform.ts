import { getModel } from "./catalog";
import { CINEMA_CONTROLS } from "./catalog/cinema-studio";
import { presetId } from "./presets";
import type { GenerationPlane, PlatformPaths } from "./catalog/types";

type Mapped = { path: string; body: Record<string, unknown> };
type Mapper = (plane: GenerationPlane) => Mapped;

const MAP: Record<string, Mapper> = {
  "soul-cinema": (plane) => mapSoul(plane, "higgsfield-ai/soul/cinema"),
  "soul-2": (plane) => mapSoul(plane, "higgsfield-ai/soul/v2/standard"),
  "soul-standard": (plane) => mapSoul(plane, "higgsfield-ai/soul/standard"),
  "cinema-studio-4": mapCinemaStudio,
  "kling-o3": (plane) => mapKlingOmni(plane, "kling-video/o3"),
  "kling-o1": (plane) => mapKlingOmni(plane, "kling-video/omni"),
  "kling-o3-edit": (plane) => mapKlingOmniEdit(plane, "kling-video/o3/video-edit"),
  "kling-o1-edit": (plane) => mapKlingOmniEdit(plane, "kling-video/omni/video-edit"),
  "kling-2.5": (plane) => mapKling25(plane, "kling-video/v2.5-turbo/standard", false),
  "kling-2.5-pro": (plane) => mapKling25(plane, "kling-video/v2.5-turbo/pro", true),
  "kling-2.6-motion-std": (plane) => mapKlingMotion(plane, "kling-video/motion-control/std"),
  "kling-2.6-motion-pro": (plane) => mapKlingMotion(plane, "kling-video/motion-control/pro"),
  "recraft-4.1": (plane) => mapRecraft(plane, "recraft/v4.1/text-to-image", "recraft/v4.1/pro/text-to-image"),
  "recraft-4.1-utility": (plane) =>
    mapRecraft(plane, "recraft/v4.1/utility/text-to-image", "recraft/v4.1/utility/pro/text-to-image"),
  "kling-3-turbo": mapKlingTurbo,
  "kling-3-std": (plane) => mapKling3(plane, "kling-video/v3.0/std"),
  "kling-3-pro": (plane) => mapKling3(plane, "kling-video/v3.0/pro"),
  "kling-3-4k": (plane) => mapKling3(plane, "kling-video/v3.0/4k"),
  "kling-3-motion-std": (plane) => mapKlingMotion(plane, "kling-video/v3/motion-control/std"),
  "kling-3-motion-pro": (plane) => mapKlingMotion(plane, "kling-video/v3/motion-control/pro"),
  "seedance-2": (plane) => mapSeedance(plane, "bytedance/seedance-2.0"),
  "seedance-2-fast": (plane) => mapSeedance(plane, "bytedance/seedance-2.0/fast"),
  "seedance-2-mini": (plane) => mapSeedance(plane, "bytedance/seedance-2.0/mini"),
  "seedance-2.5": (plane) => mapSeedance(plane, "bytedance/seedance-2.5"),
  "seedance-2.5-edit": (plane) => mapSeedanceSource(plane, "bytedance/seedance-2.5/video-edit", false),
  "seedance-2.5-extend": (plane) => mapSeedanceSource(plane, "bytedance/seedance-2.5/video-extend", true),
  "marketing-studio-image": (plane) => mapMarketingStudio(plane, "marketing-studio/image", true),
  "marketing-studio-flare": (plane) => mapMarketingStudio(plane, "marketing-studio/image/flare", false),
  "marketing-studio-sunburst": (plane) => mapMarketingStudio(plane, "marketing-studio/image/sunburst", false),
  "genjutsu-motion": (plane) => mapGenjutsu(plane, "higgsfield/genjutsu/motion-transfer/v1.0"),
  // The platform publishes this path with the "higgsfiled" spelling.
  "genjutsu-swap": (plane) => mapGenjutsu(plane, "higgsfiled/genjutsu/object-swap/v1.0"),
};

export function toPlatform(plane: GenerationPlane): Mapped {
  const model = getModel(plane.model);
  const map = MAP[model.id] ?? (model.paths ? (next) => mapByPaths(next, model.paths!) : undefined);
  if (!map) throw new Error(`No platform map for ${plane.model}`);
  return map(plane);
}

function urls(plane: GenerationPlane, role: "start" | "end" | "reference" | "video" | "audio") {
  return (plane.media[role] ?? []).map((item) => item.url);
}

function mapSoul(plane: GenerationPlane, path: string): Mapped {
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      batch_size: Number(plane.settings.batchSize),
      resolution: plane.settings.resolution,
      aspect_ratio: plane.settings.aspectRatio,
      enhance_prompt: plane.settings.enhancePrompt,
    },
  };
}

function mapKlingTurbo(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  return {
    path: start
      ? "kling-video/v3.0-turbo/image-to-video"
      : "kling-video/v3.0-turbo/text-to-video",
    body: {
      prompt: plane.prompt.text,
      duration: plane.settings.duration,
      resolution: plane.settings.resolution,
      ...(start ? { image_url: start } : { aspect_ratio: plane.settings.aspectRatio }),
    },
  };
}

function mapKling3(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    sound: plane.settings.sound ? "on" : "off",
    duration: plane.settings.duration,
    cfg_scale: plane.settings.cfgScale,
    multi_shots: plane.settings.multiShots,
  };
  if (start) {
    body.image_url = start;
    if (end) body.last_image_url = end;
    return { path: `${prefix}/image-to-video`, body };
  }
  body.aspect_ratio = plane.settings.aspectRatio;
  return { path: `${prefix}/text-to-video`, body };
}

function mapKlingMotion(plane: GenerationPlane, path: string): Mapped {
  const start = urls(plane, "start")[0];
  const video = urls(plane, "video")[0];
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      ...(start ? { image_url: start } : {}),
      ...(video ? { video_url: video } : {}),
      keep_original_sound: plane.settings.keepOriginalSound ? "yes" : "no",
      character_orientation: plane.settings.characterOrientation,
    },
  };
}

function mapKlingOmni(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference").slice(0, 4);
  const video = urls(plane, "video")[0];
  const shared = {
    prompt: plane.prompt.text,
    aspect_ratio: plane.settings.aspectRatio,
  };
  if (start) {
    return {
      path: `${prefix}/first-last-frame`,
      body: {
        ...shared,
        mode: plane.settings.mode,
        duration: plane.settings.duration,
        ...sound(plane),
        first_frame_url: start,
        ...(end ? { last_frame_url: end } : {}),
      },
    };
  }
  if (video) {
    /* A video reference renders at std or pro, for 3–10 seconds, without sound. */
    return {
      path: `${prefix}/video-reference`,
      body: {
        ...shared,
        mode: plane.settings.mode === "std" ? "std" : "pro",
        duration: Math.min(Number(plane.settings.duration), 10),
        video_urls: [video],
        ...(refs.length ? { image_urls: refs } : {}),
      },
    };
  }
  return {
    path: `${prefix}/image-reference`,
    body: {
      ...shared,
      mode: plane.settings.mode,
      duration: plane.settings.duration,
      ...sound(plane),
      ...(refs.length ? { image_urls: refs } : {}),
    },
  };
}

/* O3 has native audio; Omni does not declare it, so it sends no sound field. */
function sound(plane: GenerationPlane) {
  return typeof plane.settings.sound === "boolean" ? { sound: plane.settings.sound ? "on" : "off" } : {};
}

function mapKlingOmniEdit(plane: GenerationPlane, path: string): Mapped {
  const video = urls(plane, "video")[0];
  const refs = urls(plane, "reference").slice(0, 4);
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      mode: plane.settings.mode,
      ...(video ? { video_urls: [video] } : {}),
      ...(refs.length ? { image_urls: refs } : {}),
    },
  };
}

/** Standard only animates a start frame; Pro also renders from a prompt alone. */
function mapKling25(plane: GenerationPlane, prefix: string, textToVideo: boolean): Mapped {
  const start = urls(plane, "start")[0];
  return {
    path: start || !textToVideo ? `${prefix}/image-to-video` : `${prefix}/text-to-video`,
    body: {
      prompt: plane.prompt.text,
      duration: Number(plane.settings.duration),
      cfg_scale: plane.settings.cfgScale,
      ...(start ? { image_url: start } : {}),
    },
  };
}

function mapCinemaStudio(plane: GenerationPlane): Mapped {
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const audios = urls(plane, "audio");
  const controls = Object.fromEntries(
    Object.entries(CINEMA_CONTROLS).flatMap(([key, field]) => {
      const value = plane.settings[key];
      return value && value !== "auto" ? [[field, value]] : [];
    }),
  );
  return {
    path: "higgsfield/cinema-studio/4.0",
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      duration: plane.settings.duration,
      generate_audio: plane.settings.generateAudio,
      ...controls,
      ...(refs.length ? { image_urls: refs } : {}),
      ...(videos.length ? { video_urls: videos } : {}),
      ...(audios.length ? { audio_urls: audios } : {}),
    },
  };
}

/** 1k goes to the base endpoint, 2k to its Pro sibling. */
function mapRecraft(plane: GenerationPlane, base: string, pro: string): Mapped {
  const resolution = plane.settings.resolution === "2k" ? "2k" : "1k";
  return {
    path: resolution === "2k" ? pro : base,
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution,
      output_format: plane.settings.outputFormat,
    },
  };
}

/** Direct mode edits up to 16 images; a preset takes the product photo first
    and an optional model second. 2.0 Alpha only renders presets at high
    quality; the 2.5 versions keep the chosen quality. */
function mapMarketingStudio(plane: GenerationPlane, path: string, presetForcesHigh: boolean): Mapped {
  const refs = urls(plane, "reference");
  const preset = presetId(plane.settings.preset);
  const images = preset ? refs.slice(0, 2) : refs;
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      quality: preset && presetForcesHigh ? "high" : plane.settings.quality,
      moderation: plane.settings.moderation,
      enhance_prompt: Boolean(preset),
      ...(preset ? { preset_id: preset } : {}),
      ...(images.length ? { image_urls: images } : {}),
    },
  };
}

function mapGenjutsu(plane: GenerationPlane, path: string): Mapped {
  const video = urls(plane, "video")[0];
  const refs = urls(plane, "reference");
  return {
    path,
    body: {
      prompt: plane.prompt.text,
      resolution: plane.settings.resolution,
      ...(video ? { video_url: video } : {}),
      ...(refs.length ? { image_urls: refs } : {}),
    },
  };
}

function mapByPaths(plane: GenerationPlane, spec: PlatformPaths): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const body: Record<string, unknown> = {
    prompt: plane.prompt.text,
    ...(plane.settings.aspectRatio ? { aspect_ratio: plane.settings.aspectRatio } : {}),
    ...(plane.settings.resolution ? { resolution: plane.settings.resolution } : {}),
    ...(typeof plane.settings.duration === "number" ? { duration: plane.settings.duration } : {}),
  };
  if (spec.firstLast && (start || end)) {
    return {
      path: spec.firstLast,
      body: {
        ...body,
        ...(start ? { first_frame_url: start } : {}),
        ...(end ? { last_frame_url: end } : {}),
      },
    };
  }
  if (spec.image && start) {
    return {
      path: spec.image,
      body: { ...body, image_url: start, ...(end ? { last_image_url: end } : {}) },
    };
  }
  if (spec.reference && (refs.length || videos.length)) {
    return {
      path: spec.reference,
      body: {
        ...body,
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
      },
    };
  }
  if (spec.text) {
    return {
      path: spec.text,
      body: refs.length ? { ...body, image_urls: refs } : body,
    };
  }
  if (spec.image) return { path: spec.image, body };
  if (spec.reference) return { path: spec.reference, body };
  if (spec.firstLast) return { path: spec.firstLast, body };
  throw new Error("Model has no platform path");
}

function seedanceBody(plane: GenerationPlane, withDuration: boolean) {
  return {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution,
    generate_audio: plane.settings.generateAudio,
    ...(withDuration ? { duration: plane.settings.duration } : {}),
    ...(plane.settings.outputFormat ? { output_format: plane.settings.outputFormat } : {}),
  };
}

function mapSeedance(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const audios = urls(plane, "audio");
  const shared = seedanceBody(plane, true);
  if (start) {
    return {
      path: `${prefix}/image-to-video`,
      body: { ...shared, image_url: start, ...(end ? { end_image_url: end } : {}) },
    };
  }
  if (refs.length || videos.length || audios.length) {
    return {
      path: `${prefix}/reference-to-video`,
      body: {
        ...shared,
        aspect_ratio: plane.settings.aspectRatio,
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
        ...(audios.length ? { audio_urls: audios } : {}),
      },
    };
  }
  return {
    path: `${prefix}/text-to-video`,
    body: { ...shared, aspect_ratio: plane.settings.aspectRatio },
  };
}

function mapSeedanceSource(plane: GenerationPlane, path: string, withDuration: boolean): Mapped {
  const [video, ...extraVideos] = urls(plane, "video");
  const refs = urls(plane, "reference");
  const audios = urls(plane, "audio");
  return {
    path,
    body: {
      ...seedanceBody(plane, withDuration),
      ...(video ? { video_url: video } : {}),
      ...(refs.length ? { image_urls: refs } : {}),
      ...(extraVideos.length ? { video_urls: extraVideos } : {}),
      ...(audios.length ? { audio_urls: audios } : {}),
    },
  };
}
