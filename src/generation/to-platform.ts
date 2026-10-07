import { getModel } from "./catalog";
import { CINEMA_CONTROLS } from "./catalog/cinema-studio";
import { selectionFor } from "./influencer";
import { presetId } from "./presets";
import type { GenerationPlane, MediaRole, PlatformPaths } from "./catalog/types";

type Mapped = { path: string; body: Record<string, unknown> };
type Mapper = (plane: GenerationPlane) => Mapped;

const MAP: Record<string, Mapper> = {
  "soul-cinema": (plane) => mapSoul(plane, "higgsfield-ai/soul/cinema"),
  "soul-2": (plane) => mapSoul(plane, "higgsfield-ai/soul/v2/standard"),
  "soul-standard": (plane) => mapSoul(plane, "higgsfield-ai/soul/standard"),
  "cinema-studio-4": mapCinemaStudio,
  "wan-3": (plane) => mapWan3(plane, "alibaba/wan-3.0"),
  "wan-3-prime": (plane) => mapWan3(plane, "alibaba/wan-3.0-prime"),
  "wan-2.7": mapWan27,
  "wan-2.6": mapWan26,
  "minimax-h3": mapMinimaxH3,
  "ltx-2.5-fast": (plane) => mapLtx(plane, "fast"),
  "ltx-2.5-pro": (plane) => mapLtx(plane, "pro"),
  "grok-imagine-video-1.5": mapGrokVideo,
  "pixverse-6": mapPixverse,
  "minimax-hailuo-2.3": mapHailuo,
  "happy-horse-1": (plane) => mapHappyHorse(plane, "alibaba/happy-horse"),
  "happy-horse-1.1": (plane) => mapHappyHorse(plane, "alibaba/happy-horse/v1.1"),
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
  "genjutsu-swap": (plane) => mapGenjutsu(plane, "higgsfield/genjutsu/object-swap/v1.0"),
  "genjutsu-restyle": mapGenjutsuRestyle,
  "grok-imagine-2": mapGrokImage,
  "qwen-image-3": mapQwenImage,
  "ideogram-4": mapIdeogram,
  "z-image-turbo": mapZImage,
  "ai-influencer": mapAiInfluencer,
};

const REQUIRED_LABEL: Record<MediaRole, string> = {
  start: "una imagen inicial",
  end: "una imagen final",
  reference: "al menos una imagen de referencia",
  video: "un video de origen",
  audio: "un audio",
};

export function toPlatform(plane: GenerationPlane): Mapped {
  const model = getModel(plane.model);
  const map = MAP[model.id] ?? (model.paths ? (next) => mapByPaths(next, model.paths!) : undefined);
  if (!map) throw new Error(`No platform map for ${plane.model}`);
  const missing = model.requires?.find((role) => !plane.media[role]?.length);
  if (missing) throw new Error(`${model.label} necesita ${REQUIRED_LABEL[missing]}`);
  return map(plane);
}

function urls(plane: GenerationPlane, role: "start" | "end" | "reference" | "video" | "audio") {
  return (plane.media[role] ?? []).map((item) => item.url);
}

function mapSoul(plane: GenerationPlane, path: string): Mapped {
  const character = presetId(plane.settings.character);
  const reference = path.endsWith("/v2/standard") ? urls(plane, "reference")[0] : undefined;
  return {
    path: reference ? "higgsfield-ai/soul/v2/image-to-image" : path,
    body: {
      prompt: plane.prompt.text,
      batch_size: Number(plane.settings.batchSize),
      resolution: plane.settings.resolution,
      aspect_ratio: plane.settings.aspectRatio,
      /* Image-to-image always processes its prompt against the reference. */
      enhance_prompt: reference ? true : plane.settings.enhancePrompt,
      ...(reference ? { image_url: reference } : {}),
      ...(character
        ? { custom_reference_id: character, custom_reference_strength: Number(plane.settings.likeness) }
        : {}),
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

function mapWan3(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const audios = urls(plane, "audio");
  const shared = {
    prompt: plane.prompt.text,
    aspect_ratio: plane.settings.aspectRatio,
    resolution: plane.settings.resolution,
    duration: plane.settings.duration,
    generate_audio: plane.settings.generateAudio,
    enable_thinking: plane.settings.thinking,
  };
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
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
        ...(audios.length ? { audio_urls: audios } : {}),
      },
    };
  }
  return { path: `${prefix}/text-to-video`, body: shared };
}

function mapWan27(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const shared = {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution,
    duration: plane.settings.duration,
  };
  if (start) {
    return {
      path: "wan/v2.7/image-to-video",
      body: { ...shared, image_url: start, ...(end ? { end_image_url: end } : {}) },
    };
  }
  if (refs.length || videos.length) {
    return {
      path: "wan/v2.7/reference-to-video",
      body: {
        ...shared,
        duration: Math.min(Number(plane.settings.duration), 10),
        aspect_ratio: plane.settings.aspectRatio === "9:16" ? "9:16" : "16:9",
        ...(refs.length ? { image_urls: refs } : {}),
        ...(videos.length ? { video_urls: videos } : {}),
      },
    };
  }
  return { path: "wan/v2.7/text-to-video", body: { ...shared, aspect_ratio: plane.settings.aspectRatio } };
}

function mapWan26(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  const videos = urls(plane, "video");
  const shared = {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution,
    duration: Number(plane.settings.duration),
  };
  if (start) return { path: "wan/v2.6/image-to-video", body: { ...shared, image_url: start } };
  if (videos.length) {
    return {
      path: "wan/v2.6/reference-to-video",
      body: { ...shared, duration: Math.min(shared.duration, 10), video_urls: videos.slice(0, 3) },
    };
  }
  return { path: "wan/v2.6/text-to-video", body: shared };
}

function mapHappyHorse(plane: GenerationPlane, prefix: string): Mapped {
  const start = urls(plane, "start")[0];
  const refs = urls(plane, "reference");
  const shared = {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution,
    duration: plane.settings.duration,
  };
  if (start) return { path: `${prefix}/image-to-video`, body: { ...shared, image_url: start } };
  if (refs.length) return { path: `${prefix}/reference-to-video`, body: { ...shared, image_urls: refs } };
  return { path: `${prefix}/text-to-video`, body: { ...shared, aspect_ratio: plane.settings.aspectRatio } };
}

function mapMinimaxH3(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const refs = urls(plane, "reference");
  const videos = urls(plane, "video");
  const audios = urls(plane, "audio");
  const shared = {
    prompt: plane.prompt.text,
    resolution: "2K",
    aspect_ratio: plane.settings.aspectRatio,
    duration: plane.settings.duration,
  };
  if (start) {
    return {
      path: "minimax/h3/image-to-video",
      body: { ...shared, image_url: start, ...(end ? { end_image_url: end } : {}) },
    };
  }
  if (refs.length || videos.length || audios.length) {
    return {
      path: "minimax/h3/reference-to-video",
      body: {
        ...shared,
        ...(refs.length ? { image_urls: refs.slice(0, 9) } : {}),
        ...(videos.length ? { video_urls: videos.slice(0, 3) } : {}),
        ...(audios.length ? { audio_urls: audios.slice(0, 3) } : {}),
      },
    };
  }
  return { path: "minimax/h3/text-to-video", body: shared };
}

function mapLtx(plane: GenerationPlane, tier: "fast" | "pro"): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const camera = plane.settings.cameraMovement;
  return {
    path: `lightricks/ltx-2.5/${start ? "image-to-video" : "text-to-video"}/${tier}`,
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      duration: Number(plane.settings.duration),
      generate_audio: plane.settings.generateAudio,
      ...(camera && camera !== "auto" ? { camera_movement: camera } : {}),
      ...(start ? { image_url: start } : {}),
      ...(start && end ? { end_image_url: end } : {}),
    },
  };
}

function mapGrokVideo(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  const refs = urls(plane, "reference").slice(0, 7);
  const audio = urls(plane, "audio")[0];
  return {
    path: "xai/grok-imagine-video/v1.5/reference-to-video",
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      duration: plane.settings.duration,
      ...(start ? { image_url: start } : {}),
      ...(refs.length ? { image_urls: refs } : {}),
      ...(audio ? { audio_url: audio } : {}),
    },
  };
}

function mapPixverse(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  const end = urls(plane, "end")[0];
  const shared = {
    prompt: plane.prompt.text,
    resolution: plane.settings.resolution,
    duration: plane.settings.duration,
    generate_audio: plane.settings.generateAudio,
  };
  if (start) {
    return {
      path: "pixverse/v6/image-to-video",
      body: { ...shared, image_url: start, ...(end ? { end_image_url: end } : {}) },
    };
  }
  return { path: "pixverse/v6/text-to-video", body: { ...shared, aspect_ratio: plane.settings.aspectRatio } };
}

function mapHailuo(plane: GenerationPlane): Mapped {
  const start = urls(plane, "start")[0];
  return {
    path: `minimax/hailuo-2.3/standard/${start ? "image-to-video" : "text-to-video"}`,
    body: {
      prompt: plane.prompt.text,
      duration: Number(plane.settings.duration),
      prompt_optimizer: plane.settings.enhancePrompt,
      ...(start ? { image_url: start } : {}),
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

function mapGenjutsuRestyle(plane: GenerationPlane): Mapped {
  const video = urls(plane, "video")[0];
  const refs = urls(plane, "reference").slice(0, 5);
  const preset = presetId(plane.settings.preset);
  return {
    path: "higgsfield/genjutsu/restyle/v1.0",
    body: {
      prompt: plane.prompt.text,
      resolution: plane.settings.resolution,
      ...(preset ? { preset_id: preset } : {}),
      ...(video ? { video_url: video } : {}),
      image_urls: refs,
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

function mapGrokImage(plane: GenerationPlane): Mapped {
  const refs = urls(plane, "reference").slice(0, 10);
  return {
    path: "xai/grok-imagine-image-2.0",
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      quality: plane.settings.quality,
      ...(refs.length ? { image_urls: refs } : {}),
    },
  };
}

function mapQwenImage(plane: GenerationPlane): Mapped {
  const refs = urls(plane, "reference").slice(0, 3);
  const extend = plane.settings.enhancePrompt === true;
  return {
    path: refs.length ? "alibaba/qwen-image-3/edit" : "alibaba/qwen-image-3/text-to-image",
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      prompt_extend: extend,
      enable_thinking: extend && plane.settings.thinking === true,
      ...(refs.length ? { image_urls: refs } : {}),
    },
  };
}

function mapIdeogram(plane: GenerationPlane): Mapped {
  const image = urls(plane, "reference")[0];
  return {
    path: "ideogram/v4.0",
    body: {
      prompt: plane.prompt.text,
      aspect_ratio: plane.settings.aspectRatio,
      rendering_speed: String(plane.settings.renderingSpeed).toUpperCase(),
      ...(image ? { image_url: image, image_weight: Math.round(Number(plane.settings.imageWeight)) } : {}),
    },
  };
}

function mapZImage(plane: GenerationPlane): Mapped {
  return {
    path: "z-image/turbo",
    body: {
      prompt: plane.prompt.text.slice(0, 800),
      aspect_ratio: plane.settings.aspectRatio,
      resolution: plane.settings.resolution,
      prompt_extend: plane.settings.enhancePrompt === true,
    },
  };
}

function mapAiInfluencer(plane: GenerationPlane): Mapped {
  const tier = String(plane.settings.tier);
  const identity = urls(plane, "start")[0];
  const items = urls(plane, "reference").slice(0, 3);
  const selection = selectionFor(plane.settings.traits, tier);
  const brief = plane.prompt.text.trim().slice(0, 4000);
  return {
    path: "higgsfield/ai-influencer",
    body: {
      tier,
      ...(selection ? { selection } : {}),
      ...(identity ? { image_url: identity } : {}),
      ...(items.length ? { item_image_urls: items } : {}),
      ...(brief ? { brief } : {}),
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
