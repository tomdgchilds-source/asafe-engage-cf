// ─────────────────────────────────────────────────────────
// Vision analysis service — public entry points.
//
//   getVisionProvider(env)  → Anthropic (Claude Haiku 4.5) when
//                             ANTHROPIC_API_KEY is set, else OpenAI
//                             (gpt-4o-mini) when OPENAI_API_KEY is set,
//                             else null (caller marks photos 'skipped').
//   analysePhoto(env, ...)  → one validated VisionObservation per photo,
//                             with every upstream call reported via
//                             ctx.onUsage for the ai_usage log.
// ─────────────────────────────────────────────────────────
import type { Env } from "../../types";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAiProvider } from "./openai";
import type { ProviderDeps, VisionContext, VisionProvider } from "./common";
import type { VisionObservation } from "./schema";

export { VisionObservation, AreaTypeEnum } from "./schema";
export {
  VisionParseError,
  VisionHttpError,
  estimateCostUsd,
  MODEL_PRICES_PER_MTOK,
  type VisionCallUsage,
  type VisionContext,
  type VisionProvider,
  type ProviderDeps,
} from "./common";
export { ANTHROPIC_VISION_MODEL } from "./anthropic";
export { OPENAI_VISION_MODEL } from "./openai";

const present = (v: string | undefined | null): v is string =>
  typeof v === "string" && v.trim().length > 0;

/** Pick the provider by env presence. Anthropic wins when both keys exist. */
export function getVisionProvider(env: Env, deps: ProviderDeps = {}): VisionProvider | null {
  if (present(env.ANTHROPIC_API_KEY)) return createAnthropicProvider(env.ANTHROPIC_API_KEY.trim(), deps);
  if (present(env.OPENAI_API_KEY)) return createOpenAiProvider(env.OPENAI_API_KEY.trim(), deps);
  return null;
}

/** Thrown by analysePhoto when no provider is configured. */
export class VisionUnavailableError extends Error {
  constructor() {
    super("No vision provider configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)");
    this.name = "VisionUnavailableError";
  }
}

/**
 * Analyse one photo. Throws VisionUnavailableError when no key is set,
 * VisionParseError when the model cannot produce valid JSON in two tries,
 * or a VisionHttpError / network error after retries are exhausted.
 */
export async function analysePhoto(
  env: Env,
  bytes: Uint8Array,
  mime: string,
  ctx: VisionContext = {},
  deps: ProviderDeps = {},
): Promise<{ observation: VisionObservation; model: string; provider: string }> {
  const provider = getVisionProvider(env, deps);
  if (!provider) throw new VisionUnavailableError();
  const observation = await provider.analyse(bytes, mime, ctx);
  return { observation, model: provider.model, provider: provider.name };
}
