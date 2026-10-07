import { cinemaStudio4 } from "./cinema-studio";
import { dop } from "./dop";
import { flux2 } from "./flux-2";
import { flux3 } from "./flux-3";
import { genjutsuMotion, genjutsuRestyle, genjutsuSwap } from "./genjutsu";
import { grokImagine2 } from "./grok-imagine-2";
import { grokImagineVideo15 } from "./grok-imagine-video-1.5";
import { happyHorse1, happyHorse11 } from "./happy-horse";
import { ideogram4 } from "./ideogram-4";
import { kling25, kling25Pro } from "./kling-2.5";
import { kling26, kling26MotionPro, kling26MotionStd } from "./kling-2.6";
import {
  kling34k,
  kling3MotionPro,
  kling3MotionStd,
  kling3Pro,
  kling3Std,
  kling3Turbo,
} from "./kling-3";
import { klingO1, klingO1Edit, klingO3, klingO3Edit } from "./kling-omni";
import { ltx25Fast, ltx25Pro } from "./ltx-2.5";
import { marketingStudioFlare, marketingStudioImage, marketingStudioSunburst } from "./marketing-studio";
import { minimaxH3 } from "./minimax-h3";
import { minimaxHailuo23 } from "./minimax-hailuo-2.3";
import { parseSettings } from "./parse-settings";
import { pixverse6 } from "./pixverse-6";
import { qwenImage3 } from "./qwen-image-3";
import { recraft41, recraft41Utility } from "./recraft-4.1";
import { seedance2, seedance2Fast, seedance2Mini } from "./seedance-2";
import { seedance25, seedance25Edit, seedance25Extend } from "./seedance-2.5";
import { soul2, soulCinema, soulStandard } from "./soul";
import type { ModelEntry } from "./types";
import { wan26, wan27, wan3, wan3Prime } from "./wan";
import { zImageTurbo } from "./z-image-turbo";

export const MODELS: readonly ModelEntry[] = [
  soul2,
  soulCinema,
  soulStandard,
  marketingStudioImage,
  marketingStudioFlare,
  marketingStudioSunburst,
  cinemaStudio4,
  genjutsuMotion,
  genjutsuSwap,
  genjutsuRestyle,
  seedance25,
  seedance25Edit,
  seedance25Extend,
  seedance2,
  seedance2Fast,
  seedance2Mini,
  kling3Turbo,
  kling3Std,
  kling3Pro,
  kling34k,
  kling3MotionStd,
  kling3MotionPro,
  kling26MotionStd,
  kling26MotionPro,
  flux2,
  grokImagine2,
  ideogram4,
  recraft41,
  recraft41Utility,
  qwenImage3,
  zImageTurbo,
  wan3,
  wan3Prime,
  wan27,
  wan26,
  flux3,
  minimaxH3,
  minimaxHailuo23,
  happyHorse1,
  happyHorse11,
  kling26,
  kling25,
  kling25Pro,
  klingO3,
  klingO3Edit,
  klingO1,
  klingO1Edit,
  ltx25Fast,
  ltx25Pro,
  grokImagineVideo15,
  pixverse6,
  dop,
];

export function getModel(id: string): ModelEntry {
  const model = MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}

export type { GenerationPlane, MediaItem, MediaRole, ModelEntry, PlatformPaths, PresetSource, Surface } from "./types";
export { parseSettings };
