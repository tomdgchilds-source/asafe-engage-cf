// ─────────────────────────────────────────────────────────
// Provider-agnostic pieces of the vision service: shared types, the
// per-token price table used for the ai_usage log, base64 helpers, and
// the validate-and-retry-once loop both providers run their raw calls
// through.
// ─────────────────────────────────────────────────────────
import { fromZodError } from "zod-validation-error";
import type { RetryOptions } from "../../lib/retryOpenAi";
import { VisionObservation } from "./schema";
import { buildRetryPrompt, buildUserPrompt, extractJson, SYSTEM_PROMPT } from "./prompt";

/** Thrown when the model's JSON fails schema validation twice in a row. */
export class VisionParseError extends Error {
  readonly attempts: number;
  readonly lastErrors: string;
  readonly lastOutput: string;
  constructor(attempts: number, lastErrors: string, lastOutput: string) {
    super(`Vision output failed validation after ${attempts} attempts: ${lastErrors}`);
    this.name = "VisionParseError";
    this.attempts = attempts;
    this.lastErrors = lastErrors;
    this.lastOutput = lastOutput;
  }
}

/** Non-OK HTTP reply from a provider; `status` lets withRetry classify it. */
export class VisionHttpError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(provider: string, status: number, body: string) {
    super(`${provider} HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "VisionHttpError";
    this.status = status;
    this.body = body;
  }
}

/** One row for the `ai_usage` table (minus surveyId, which the route adds). */
export interface VisionCallUsage {
  kind: "vision_photo";
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsdEst: number;
}

export interface VisionContext {
  zoneName?: string;
  facilityType?: string;
  /** Called once per upstream request (so twice when a retry happens). */
  onUsage?: (usage: VisionCallUsage) => void | Promise<void>;
}

export interface VisionProvider {
  name: string;
  model: string;
  analyse(imageBytes: Uint8Array, mime: string, ctx: VisionContext): Promise<VisionObservation>;
}

/** Injectables for providers — primarily for tests. */
export interface ProviderDeps {
  fetch?: typeof fetch;
  retry?: RetryOptions;
}

export interface EncodedImage {
  base64: string;
  mime: string;
}

/** What a provider must send on each attempt. */
export interface RawVisionRequest {
  system: string;
  image: EncodedImage;
  userText: string;
  /**
   * Present on the retry: the model's previous reply and the correction
   * request, appended as assistant + user turns after the first user turn.
   */
  followUp?: { assistantText: string; userText: string };
}

export interface RawVisionResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export type RawVisionCaller = (req: RawVisionRequest) => Promise<RawVisionResponse>;

// ─── pricing ───────────────────────────────────────────────
// USD per million tokens. Anthropic prices from the claude-api skill's
// model table (Claude Haiku 4.5: $1.00 in / $5.00 out). OpenAI prices from
// OpenAI's published gpt-4o-mini rate card ($0.15 in / $0.60 out).
export const MODEL_PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

/** Estimated USD cost of one call; 0 for models not in the price table. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  // Dated ids (claude-haiku-4-5-20251001) price the same as their alias.
  const price =
    MODEL_PRICES_PER_MTOK[model] ??
    MODEL_PRICES_PER_MTOK[model.replace(/-\d{8}$/, "")];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// ─── helpers ───────────────────────────────────────────────

const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Normalise a client-supplied mime to one both providers accept. */
export function normaliseImageMime(mime: string | undefined | null): string {
  const m = (mime ?? "").toLowerCase().trim();
  if (m === "image/jpg") return "image/jpeg";
  return SUPPORTED_IMAGE_MIMES.has(m) ? m : "image/jpeg";
}

/** Uint8Array → base64 without Buffer (Workers runtime). Chunked to avoid call-stack limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

// ─── validate-and-retry loop ───────────────────────────────

function tryParse(text: string): { ok: true; value: VisionObservation } | { ok: false; errors: string } {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(text));
  } catch (err) {
    return { ok: false, errors: `Output was not valid JSON (${(err as Error).message})` };
  }
  const result = VisionObservation.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: fromZodError(result.error).message };
}

/**
 * Drive one provider call through the shared prompt, parse the reply
 * against VisionObservation, and on failure retry exactly once with the
 * validation errors appended as a correction turn. Every upstream call is
 * reported through `ctx.onUsage` so the route can write ai_usage rows.
 */
export async function runValidatedAnalysis(
  call: RawVisionCaller,
  model: string,
  image: EncodedImage,
  ctx: VisionContext,
  provider = "unknown",
): Promise<VisionObservation> {
  const base: RawVisionRequest = {
    system: SYSTEM_PROMPT,
    image,
    userText: buildUserPrompt({ zoneName: ctx.zoneName, facilityType: ctx.facilityType }),
  };

  const record = async (res: RawVisionResponse) => {
    if (!ctx.onUsage) return;
    await ctx.onUsage({
      kind: "vision_photo",
      provider,
      model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      costUsdEst: estimateCostUsd(model, res.inputTokens, res.outputTokens),
    });
  };

  const first = await call(base);
  await record(first);
  const parsed1 = tryParse(first.text);
  if (parsed1.ok) return parsed1.value;

  const second = await call({
    ...base,
    followUp: { assistantText: first.text, userText: buildRetryPrompt(parsed1.errors) },
  });
  await record(second);
  const parsed2 = tryParse(second.text);
  if (parsed2.ok) return parsed2.value;

  throw new VisionParseError(2, parsed2.errors, second.text);
}
