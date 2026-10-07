import { decodeTraits } from "@/generation/influencer";
import { presetName } from "@/generation/presets";
import type { MediaRole, ModelEntry, Surface } from "@/generation/catalog";

export const SURFACES: readonly Surface[] = ["image", "video"];

export const SURFACE_LABELS: Record<Surface, string> = {
  image: "Imagen",
  video: "Video",
};

/** What the gallery is scoped to. "assets" is every run, both surfaces;
    "favorites" is every run the visitor kept, both surfaces. */
export type GalleryView = Surface | "assets" | "favorites";

/** Scopes that span both surfaces, so switching to them leaves the model alone. */
export const CROSS_VIEWS = new Set<GalleryView>(["assets", "favorites"]);

export const VIEWS: readonly GalleryView[] = ["image", "video", "assets", "favorites"];

export const VIEW_LABELS: Record<GalleryView, string> = {
  ...SURFACE_LABELS,
  assets: "Archivos",
  favorites: "Favoritos",
};

export const PROMPT_PLACEHOLDERS: Record<Surface, string> = {
  image: "Describe la imagen — sujeto, estilo, luz, lente…",
  video: "Describe la escena — sujeto, movimiento de cámara, luz, ritmo…",
};

/* The pool the empty state draws from. Each line is a whole prompt — subject,
   light, lens or camera move — so a click loads something worth pressing
   Generate on rather than a fragment to finish. */
export const SAMPLES: Record<Surface, string[]> = {
  image: [
    "Retrato de una apicultora en un huerto soleado, película de formato medio, poca profundidad de campo",
    "Corte isométrico de un pequeño estudio de grabación, luz cálida de tungsteno, render de arcilla mate",
    "Bodegón editorial: jarrones de concreto brutalista con amapolas silvestres, sombras duras de mediodía",
    "Callejón mojado por la lluvia a medianoche, faroles de sodio, reflejos en cada charco, 35mm",
    "Retrato de estudio de un luthier anciano sosteniendo un violín a medio hacer, una sola luz suave, fondo negro",
    "Vista aérea cenital de salinas, geometría rosa y ocre, claridad de mediodía",
    "Ilustración en corte del mecanismo de un reloj, líneas de plano sobre papel cálido",
    "Casa modernista cubierta de helechos, luz nublada, detalle de gran formato",
    "Taza de espresso de cerámica mate sobre pizarra mojada, luz de contorno, vapor en el aire",
    "Interior de un refugio de esquí de los 70, paneles de madera y lana naranja, sol bajo de invierno",
    "Manos amasando sobre mármol enharinado, luz de ventana, paleta apagada, encuadre cerrado",
    "Observatorio en el desierto a la hora azul, larga exposición, estelas de estrellas sobre una cúpula blanca",
  ],
  video: [
    "Dolly aéreo lento sobre un bosque de pinos con niebla al amanecer, rayos de luz entre las copas",
    "Toma macro de tinta abriéndose en agua, contraluz, cámara ultra lenta, fondo negro",
    "Travelling en mano por un mercado de neón de noche, lluvia en el lente, foco corto",
    "Plano fijo de una cafetería a las 3am, un solo cliente, lluvia afuera, letrero parpadeando",
    "Acercamiento lento a las manos de un escultor moldeando arcilla húmeda, luz de ventana",
    "Dron orbitando un faro con oleaje fuerte, mar gris, espuma golpeando el lente",
    "Timelapse de sombras de nubes cruzando un cañón, de la hora dorada al anochecer",
    "Steadicam caminando por un invernadero vacío, polvo en haces de luz, revelación lenta",
    "Barrido rápido de un disco girando a una bailarina en pleno giro, luz cálida, mucho desenfoque de movimiento",
    "Toma submarina de una nadadora saliendo a la superficie, burbujas, luz del sol refractada",
    "Plano general fijo de un tren cruzando un viaducto al atardecer, ventanas iluminadas, teleobjetivo",
    "Paneo vertical lento por la fachada de vidrio de una torre hasta un cruce peatonal concurrido",
  ],
};

/** A few of the pool in a fresh order, so two visits are not handed the same
    shelf. Called on the client only — picking during render would give the
    server a different set than the hydrating client. */
export function pickSamples(surface: Surface, count = 3): string[] {
  const pool = [...SAMPLES[surface]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

const SETTING_LABELS: Record<string, string> = {
  aspectRatio: "Formato",
  resolution: "Resolución",
  outputFormat: "Tipo de archivo",
  duration: "Duración",
  generateAudio: "Generar audio",
  batchSize: "Cantidad",
  enhancePrompt: "Mejorar texto",
  thinking: "Razonamiento",
  numImages: "Imágenes",
  sound: "Sonido",
  cfgScale: "Fidelidad al texto",
  multiShots: "Varias tomas",
  keepOriginalSound: "Mantener sonido original",
  characterOrientation: "Orientación",
  genre: "Género",
  era: "Época",
  pacing: "Ritmo",
  light: "Iluminación",
  cameraMovement: "Movimiento de cámara",
  cameraModel: "Cámara",
  cameraLens: "Lente",
  cameraAperture: "Apertura",
  colorPalette: "Paleta",
  preset: "Estilo",
  mode: "Modo",
  quality: "Calidad",
  moderation: "Moderación",
  renderingSpeed: "Velocidad",
  imageWeight: "Peso de la imagen",
  tier: "Tipo de personaje",
  character: "Soul ID",
  likeness: "Parecido",
  traits: "Apariencia",
  seed: "Semilla",
};

/* AI Influencer's character types, named the way its playground names them. */
const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  freak: "Llamativo",
  total: "Extremo",
  insects: "Insecto",
  frogs: "Rana",
  cats: "Gato",
  dogs: "Perro",
  capybaras: "Roedor",
  birds: "Pájaro",
};

/* Enum values the platform writes in English, shown in Spanish. Sizes, ratios
   and codes stay as written. */
const VALUE_LABELS: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta",
  max: "máxima",
  std: "Estándar",
  pro: "Pro",
  turbo: "Turbo",
  default: "Normal",
  quality: "Calidad",
  adaptive: "Adaptativo",
  jpg: "JPG",
  png: "PNG",
  webp: "WEBP",
  mp4: "MP4",
};

/* Cinema Studio's creative controls arrive as kebab-case slugs. */
const SLUG_KEYS = new Set([
  "genre", "era", "pacing", "light", "cameraMovement", "cameraModel", "cameraLens",
  "cameraAperture", "colorPalette",
]);

/* A pill carries one word; "Generate audio" is a panel label, not a control on
   a crowded rail. Only keys that read badly at pill length appear here. */
const SETTING_PILL_LABELS: Record<string, string> = {
  generateAudio: "Audio",
  keepOriginalSound: "Sonido original",
  cameraMovement: "Cámara",
};

export function settingLabel(key: string): string {
  return (
    SETTING_LABELS[key] ??
    key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase())
  );
}

/* A pill with no glyph shows its value alone, so a bare "Auto" or "low" needs
   its setting named to be told apart from its neighbours. */
export function settingPillValue(key: string, value: unknown): string {
  const text = settingValueLabel(key, value);
  if (key === "quality") return `Calidad ${text.toLowerCase()}`;
  if (key === "moderation") return `Moderación ${text.toLowerCase()}`;
  if (key === "renderingSpeed") return `Velocidad ${text.toLowerCase()}`;
  if (key === "preset") return text === "Ninguno" ? "Sin estilo" : text;
  if (key === "character") return text === "Ninguno" ? "Sin Soul ID" : text;
  if (key === "likeness") return `Parecido ${text}`;
  if (key === "characterOrientation") return `Orientación: ${text.toLowerCase()}`;
  if (key === "mode") return `Modo ${text}`;
  if (SLUG_KEYS.has(key)) return value === "auto" ? `${settingPillLabel(key)}: auto` : text;
  return text;
}

export function settingPillLabel(key: string): string {
  return SETTING_PILL_LABELS[key] ?? settingLabel(key);
}

/* Values arrive in the platform's own casing. Only the units conventionally
   set in caps are lifted; "720p" and "16:9" are already how they are written. */
export function settingValueLabel(key: string, value: unknown): string {
  if (key === "preset") return presetName(value) ?? "Ninguno";
  if (key === "character") return presetName(value) ?? "Ninguno";
  if (key === "likeness" && typeof value === "number") return `${Math.round(value * 100)}%`;
  if (key === "traits") {
    const picks = Object.values(decodeTraits(value)?.selection ?? {}).flat();
    return picks.length ? picks.map((pick) => pick.replace(/^[a-z]{1,4}_/, "").replace(/_/g, " ")).join(", ") : "Al azar";
  }
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return key === "duration" ? `${value}s` : String(value);
  const text = String(value);
  if (key === "duration" && /^\d+$/.test(text)) return `${text}s`;
  if (text === "auto") return "Auto";
  if (key === "tier") return TIER_LABELS[text] ?? text;
  if (key === "characterOrientation") return text === "video" ? "Como el video" : "Como la imagen";
  if (VALUE_LABELS[text] && !SLUG_KEYS.has(key)) {
    const word = VALUE_LABELS[text]!;
    return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  }
  if (/^\d+k$/.test(text)) return text.toUpperCase();
  if (key === "outputFormat") return text.toUpperCase();
  if (SLUG_KEYS.has(key)) return text.replace(/[-_]/g, " ");
  return text;
}

export const ROLE_LABELS: Record<MediaRole, string> = {
  start: "Imagen inicial",
  end: "Imagen final",
  reference: "Referencia",
  video: "Video",
  audio: "Audio",
};

/* Slate tags for the attachment tiles, where the full label will not fit. */
export const ROLE_TAGS: Record<MediaRole, string> = {
  start: "INICIO",
  end: "FINAL",
  reference: "REF",
  video: "VIDEO",
  audio: "AUDIO",
};

/* What a role can hold, in the coarser unit the asset library sorts by. The
   accept string above is the file dialog's business; this is the picker's. */
export type AssetKind = "image" | "video" | "audio";

export const ROLE_KINDS: Record<MediaRole, AssetKind> = {
  start: "image",
  end: "image",
  reference: "image",
  video: "video",
  audio: "audio",
};

/* The picker's confirm button names what it attaches — "Add 2 references",
   "Add start frame" — so each role carries its plural rather than taking an s. */
const ROLE_PLURALS: Record<MediaRole, string> = {
  start: "imágenes iniciales",
  end: "imágenes finales",
  reference: "referencias",
  video: "videos",
  audio: "audios",
};

/* Spanish plural of a slot name: the head noun takes the ending ("foto de
   identidad" → "fotos de identidad"). */
function pluralize(label: string): string {
  const [head, ...rest] = label.split(" ");
  const plural = /[aeiouáéó]$/i.test(head!) ? `${head}s` : `${head}es`;
  return [plural, ...rest].join(" ");
}

export function roleNoun(role: MediaRole, count: number, model?: ModelEntry): string {
  const own = model?.roleLabels?.[role];
  if (own) return count === 1 ? own.toLowerCase() : pluralize(own.toLowerCase());
  return count === 1 ? ROLE_LABELS[role].toLowerCase() : ROLE_PLURALS[role];
}

/** A role's name on this model — AI Influencer's start slot is an identity photo. */
export function roleLabel(model: ModelEntry, role: MediaRole): string {
  return model.roleLabels?.[role] ?? ROLE_LABELS[role];
}

export function roleTag(model: ModelEntry, role: MediaRole): string {
  const own = model.roleLabels?.[role];
  return own ? own.split(" ")[0]!.toUpperCase() : ROLE_TAGS[role];
}

/* Mirrors the allow-list in src/app/api/blob/route.ts. */
export const ROLE_ACCEPT: Record<MediaRole, string> = {
  start: "image/jpeg,image/png,image/webp,image/gif",
  end: "image/jpeg,image/png,image/webp,image/gif",
  reference: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/quicktime,.mov",
  audio: "audio/wav,audio/x-wav,audio/mpeg,.mp3",
};

export function rolesOf(model: ModelEntry): MediaRole[] {
  return Object.keys(model.roles) as MediaRole[];
}

export function defaultRole(model: ModelEntry): MediaRole {
  if (model.surface === "image" && model.roles.reference) return "reference";
  if (model.roles.start) return "start";
  return rolesOf(model)[0] ?? "reference";
}

const RATIO = /^(\d+):(\d+)$/;

/** The mini rectangle a ratio value draws, scaled into a 14px optical box —
    null when the value is not a ratio ("auto"), so the caller can reserve the
    slot or draw a plain frame instead. */
export function ratioBox(value: string): { width: number; height: number } | null {
  const match = RATIO.exec(value);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  const scale = 14 / Math.max(w, h);
  return { width: Math.max(5, Math.round(w * scale)), height: Math.max(5, Math.round(h * scale)) };
}

export function ratioToCss(value: unknown, fallback: string): string {
  const match = RATIO.exec(String(value ?? ""));
  return match ? `${match[1]} / ${match[2]}` : fallback;
}

/* Two roles share one word — a start and an end frame are both frames — so the
   phrases dedupe before they are listed. */
const ROLE_PHRASES: Record<MediaRole, string> = {
  start: "imágenes de inicio/fin",
  end: "imágenes de inicio/fin",
  reference: "referencias",
  video: "videos",
  audio: "audio",
};

function joinPhrases(parts: string[]): string {
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} o ${parts[parts.length - 1]}`;
}

/** The line under a model's name in the picker, derived from the entry itself:
    what it makes, what it takes, where its allow-lists top out. The catalog
    stays the only place a model's truth is written down. */
export function describeModel(model: ModelEntry): string {
  const noun = model.surface === "image" ? "Imágenes" : "Video";
  const inputs = [
    ...new Set(
      rolesOf(model).map((role) => {
        const own = model.roleLabels?.[role];
        return own ? pluralize(own.toLowerCase()) : ROLE_PHRASES[role];
      }),
    ),
  ];
  const source = inputs.length
    ? `${noun} desde texto, ${joinPhrases(inputs)}`
    : `${noun} desde texto`;

  const limits: string[] = [];
  const resolution = model.settings.resolution;
  /* The catalog declares resolutions in ascending order, so the ceiling is the
     last value it lists. */
  if (resolution?.type === "enum" && resolution.values.length > 0) {
    const top = resolution.values[resolution.values.length - 1]!;
    limits.push(`hasta ${settingValueLabel("resolution", top)}`);
  }
  const duration = model.settings.duration;
  if (duration?.type === "range") limits.push(`${duration.min}–${duration.max}s`);

  return limits.length ? `${source} · ${limits.join(", ")}` : source;
}

/* Keys that already mean "results per request". The composer shows one batch
   control whatever the model is: where the catalog declares one of these it
   writes the setting and the platform answers with that many media; every
   other model is submitted once per result. A key named here is claimed by the
   batch control and never also drawn as a settings pill, so the studio's count
   and the model's own can never disagree. */
export const COUNT_KEYS = ["numImages", "batchSize"];

export type CountSetting = {
  key: string;
  /** How the value is written back: an enum stores the count as the string the
      catalog declared, a range stores it as a number. */
  kind: "enum" | "range";
  /** Every count the model allows, ascending. The control walks this list, so a
      model offering only 1 or 4 can never be left on an illegal 2. */
  counts: number[];
};

export function countSetting(model: ModelEntry): CountSetting | null {
  for (const key of COUNT_KEYS) {
    const field = model.settings[key];
    if (field?.type === "range") {
      const counts: number[] = [];
      for (let n = field.min; n <= field.max; n++) counts.push(n);
      return { key, kind: "range", counts };
    }
    if (field?.type === "enum") {
      const counts = field.values.map(Number).filter(Number.isInteger).sort((a, b) => a - b);
      if (counts.length > 0) return { key, kind: "enum", counts };
    }
  }
  return null;
}

/* The two or three facts that summarise a run at a glance, in the same casing
   the settings panel and the viewer write them — the grid draws these as
   separate chips by splitting on the separator. */
export function metaOf(model: ModelEntry, values: Record<string, unknown>): string {
  const label = (key: string) =>
    values[key] === undefined ? null : settingValueLabel(key, values[key]);
  const parts =
    model.surface === "image"
      ? [label("resolution"), label("outputFormat")]
      : [label("resolution"), label("duration"), values.generateAudio === true ? "Audio" : null];
  return parts.filter(Boolean).join(" · ");
}

export function durationBadge(values: Record<string, unknown>): string | undefined {
  if (typeof values.duration !== "number") return undefined;
  return formatClock(values.duration);
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, Math.round(totalSeconds - m * 60));
  return `${m}:${String(s).padStart(2, "0")}`;
}
