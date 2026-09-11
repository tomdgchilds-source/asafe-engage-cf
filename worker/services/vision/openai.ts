// ─────────────────────────────────────────────────────────
// OpenAI Chat Completions provider (raw fetch) — fallback when no
// ANTHROPIC_API_KEY is configured. Uses gpt-4o-mini with
// response_format json_object; the image is sent as a data-URL
// image_url part.
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

export const OPENAI_VISION_MODEL = "gpt-4o-mini";
export const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MAX_TOKENS = 2048;

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenAiProvider(apiKey: string, deps: ProviderDeps = {}): VisionProvider {
  const fetchImpl = deps.fetch ?? fetch;

  const call: RawVisionCaller = async (req) => {
    const messages: unknown[] = [
      { role: "system", content: req.system },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${req.image.mime};base64,${req.image.base64}`, detail: "low" },
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
      model: OPENAI_VISION_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    };

    const data = await withRetry(
      "openai.chat.vision",
      async () => {
        const res = await fetchImpl(OPENAI_CHAT_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new VisionHttpError("openai", res.status, await res.text());
        }
        return (await res.json()) as OpenAiChatResponse;
      },
      deps.retry,
    );

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  };

  return {
    name: "openai",
    model: OPENAI_VISION_MODEL,
    analyse(bytes, mime, ctx) {
      const image = { base64: bytesToBase64(bytes), mime: normaliseImageMime(mime) };
      return runValidatedAnalysis(call, OPENAI_VISION_MODEL, image, ctx, "openai");
    },
  };
}
