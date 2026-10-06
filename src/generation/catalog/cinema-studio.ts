import type { ModelEntry } from "./types";

/* Each creative control left on "auto" is omitted from the request, so the
   director picks it; the platform does not accept the literal "auto". */
const auto = <T extends string>(...values: T[]) =>
  ({ type: "enum", values: ["auto", ...values], default: "auto" }) as const;

/** Cinema Studio 4.0: text-to-video without references, reference-to-video
    with any. Billed per 1,000 video tokens, cheaper with video input. */
export const cinemaStudio4: ModelEntry = {
  id: "cinema-studio-4",
  surface: "video",
  label: "Cinema Studio 4.0",
  roles: { reference: 30, video: 10, audio: 10 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
      default: "16:9",
    },
    resolution: { type: "enum", values: ["480p", "720p"], default: "720p" },
    duration: { type: "range", min: 4, max: 30, default: 5 },
    generateAudio: { type: "boolean", default: true },
    genre: auto("epic", "drama", "noir", "comedy", "horror", "action"),
    era: auto("1960s", "1980s", "1990s", "2000s", "2020s"),
    pacing: auto("chaotic", "dynamic", "calm", "single-shot"),
    light: auto("silhouette", "practicals", "window", "overhead-fall", "contre-jour", "soft-cross"),
    cameraMovement: auto(
      "static-shot", "handheld", "tracking", "side-tracking", "dolly-in", "dolly-out",
      "dolly-zoom", "slow-zoom-in", "slow-zoom-out", "crush-zoom", "pan-left", "pan-right",
      "whip-pan", "tilt-up", "tilt-down", "truck-left", "truck-right", "slider-left",
      "slider-right", "arc-left", "arc-right", "crane-up", "crane-down", "pedestal-up",
      "pedestal-down", "drone-orbit", "aerial-pullback", "helicopter-shot", "robot-arm",
      "snorricam", "pov", "rack-focus", "bullet-time",
    ),
    cameraModel: auto("modern", "35mm-film", "8mm-film", "dv-camcorder"),
    cameraLens: auto("clean-sharp", "anamorphic", "vintage-anamorphic", "warm-vintage", "halation-vintage"),
    cameraAperture: auto("f14-wide-open", "f4-moderate", "f11-deep-focus"),
    colorPalette: auto(
      "static-noon", "twilight-fable", "back-row-kissing-seats", "on-the-other-side-of-the-porthole",
      "the-emerald-ambush", "highway-standoff", "the-faded-fresco", "oil-ochre",
      "the-mountain-convent", "ghost-in-the-code", "pink-velvet", "two-days-to-the-horizon",
      "industrial-fog", "stairs-go-up", "field-post", "home-is-the-next-gas-station",
      "glossy-flesh", "the-crimson-ballet", "neon-rain-at-midnight", "the-morning-after-rain",
      "the-iron-borough", "the-ground", "the-investigation", "turquoise-mirage",
      "a-dream-in-color", "breakfast-on-schedule", "favela-gold", "a-hotel-for-one",
      "after-dark", "crimson-vigi", "the-neighbors-saw-everything", "the-grey-channel",
      "mirage-at-noon", "bubblegum-boulevard", "yellow-room", "the-earth-keeps-things-reluctantly",
      "tropic-fever-dream", "bioluminescent-night", "dont-turn-it-off-im-watching",
      "the-silk-curtain-falls", "the-butterfly", "playtime", "wallpaper-romance", "overtime",
      "the-way-home-is-longer", "everyone-speaks-in-whispers", "runaway-summer",
      "amber-wasteland", "the-circus", "gasoline-sunset",
    ),
  },
};

/** The request fields each creative control maps to. */
export const CINEMA_CONTROLS = {
  genre: "genre",
  era: "era",
  pacing: "pacing",
  light: "light",
  cameraMovement: "camera_movement",
  cameraModel: "camera_model",
  cameraLens: "camera_lens",
  cameraAperture: "camera_aperture",
  colorPalette: "color_palette",
} as const;
