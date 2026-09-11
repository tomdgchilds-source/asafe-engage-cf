// ─────────────────────────────────────────────────────────
// Anthropic Messages API provider (raw fetch, no SDK — the Worker bundle
// stays SDK-free by project decision). Model: Claude Haiku 4.5, the
// cheapest vision-capable Claude. Image goes in as a base64 image block
// ahead of the text block, per the Messages API vision shape.
// ─────────────────────────────────────────────────────────
import { withRetry } from "../../lib/retryOpenAi";
import {
  normaliseImageMime,
  bytesToBase64,
  runValidatedAnalysis,
  VisionHttpError,
  type ProviderDeps,
  type RawVisionCaller,
  type VisionProvider,
} from "./common";

/** Exact model id from the claude-api skill's model table (no date suffix). */
export const ANTHROPIC_VISION_MODEL = "claude-haiku-4-5-20251001";
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Structured JSON output is ~300-600 tokens; 2048 leaves generous headroom
// without letting a runaway reply cost much.
const MAX_TOKENS = 2048;

interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicMessageResponse {
  content: Array<AnthropicTextBlock | { type: string }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function createAnthropicProvider(apiKey: string, deps: ProviderDeps = {}): VisionProvider {
  const fetchImpl = deps.fetch ?? fetch;

  const call: RawVisionCaller = async (req) => {
    const messages: unknown[] = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: req.image.mime, data: req.image.base64 },
          },
          { type: "text", text: req.userText },
        ],
      },
    ];
    if (req.followUp) {
      messages.push({ role: "assistant", content: req.followUp.assistantText });
      messages.push({ role: "user", content: req.followUp.userText });
    }

    const body = {
      model: ANTHROPIC_VISION_MODEL,
      max_tokens: MAX_TOKENS,
      system: req.system,
      messages,
    };

    const data = await withRetry(
      "anthropic.messages.vision",
      async () => {
        const res = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new VisionHttpError("anthropic", res.status, await res.text());
        }
        return (await res.json()) as AnthropicMessageResponse;
      },
      deps.retry,
    );

    const text = (data.content ?? [])
      .filter((b): b is AnthropicTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  };

  return {
    name: "anthropic",
    model: ANTHROPIC_VISION_MODEL,
    analyse(bytes, mime, ctx) {
      const image = { base64: bytesToBase64(bytes), mime: normaliseImageMime(mime) };
      return runValidatedAnalysis(call, ANTHROPIC_VISION_MODEL, image, ctx, "anthropic");
    },
  };
}
