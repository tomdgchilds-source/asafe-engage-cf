import { describe, it, expect, vi } from "vitest";
import { VisionObservation } from "./schema";
import { buildUserPrompt, buildRetryPrompt, extractJson, SYSTEM_PROMPT } from "./prompt";
import {
  estimateCostUsd,
  bytesToBase64,
  runValidatedAnalysis,
  VisionParseError,
  type RawVisionCaller,
  type VisionCallUsage,
} from "./common";
import { createAnthropicProvider, ANTHROPIC_VISION_MODEL } from "./anthropic";
import { createOpenAiProvider, OPENAI_VISION_MODEL } from "./openai";
import { getVisionProvider } from "./index";
import type { Env } from "../../types";

// ─── fixtures ──────────────────────────────────────────────

const GOOD: VisionObservation = {
  sceneSummary: "Racking aisle with a forklift and unprotected aisle-end uprights.",
  areaType: "racking_aisle",
  observedElements: [
    { type: "racking", condition: "unprotected", note: "No rack-end barrier." },
    { type: "vehicle", condition: "good", note: "Counterbalance forklift." },
  ],
  hazards: [
    { tag: "unprotected_racking", severity: "high", evidence: "Exposed uprights at aisle end." },
  ],
  likelyVehicles: ["counterbalance_forklift"],
  floorType: "concrete",
  existingProtection: "none",
  pedestrianExposure: "occasional",
  suggestedRiskLevel: "high",
  confidence: 0.8,
  observation:
    "Aisle-end uprights are unprotected where forklifts turn under load. Rack-end barriers are required.",
};

const envWith = (over: Partial<Env>): Env =>
  ({ OPENAI_API_KEY: "", ...over }) as unknown as Env;

// ─── schema ────────────────────────────────────────────────

describe("VisionObservation schema", () => {
  it("parses a good fixture", () => {
    const r = VisionObservation.safeParse(GOOD);
    expect(r.success).toBe(true);
  });

  it("rejects a fixture with a missing field", () => {
    const { observation: _drop, ...bad } = GOOD;
    const r = VisionObservation.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "observation")).toBe(true);
    }
  });

  it("rejects out-of-vocabulary enums and out-of-range confidence", () => {
    expect(VisionObservation.safeParse({ ...GOOD, areaType: "kitchen" }).success).toBe(false);
    expect(VisionObservation.safeParse({ ...GOOD, confidence: 1.5 }).success).toBe(false);
    expect(
      VisionObservation.safeParse({ ...GOOD, observation: "x".repeat(601) }).success,
    ).toBe(false);
  });

  it("enforces array caps", () => {
    const hazards = Array.from({ length: 9 }, () => GOOD.hazards[0]);
    expect(VisionObservation.safeParse({ ...GOOD, hazards }).success).toBe(false);
  });
});

// ─── prompt builder ────────────────────────────────────────

describe("prompt builder", () => {
  it("system prompt describes A-SAFE, PAS 13 vocabulary, schema and three examples", () => {
    expect(SYSTEM_PROMPT).toContain("A-SAFE");
    expect(SYSTEM_PROMPT).toContain("PAS 13");
    expect(SYSTEM_PROMPT).toContain("Deflection zone");
    expect(SYSTEM_PROMPT).toContain('"suggestedRiskLevel"');
    expect(SYSTEM_PROMPT).toContain("Example 1");
    expect(SYSTEM_PROMPT).toContain("Example 2");
    expect(SYSTEM_PROMPT).toContain("Example 3");
    expect(SYSTEM_PROMPT).toMatch(/ONLY a single JSON object/);
  });

  it("few-shot examples in the system prompt each parse against the schema", () => {
    const examples = SYSTEM_PROMPT.split(/Example \d[^\n]*\n/).slice(1);
    expect(examples.length).toBe(3);
    for (const ex of examples) {
      const parsed = VisionObservation.safeParse(JSON.parse(extractJson(ex)));
      expect(parsed.success).toBe(true);
    }
  });

  it("user prompt includes zone and facility context when supplied", () => {
    const p = buildUserPrompt({ zoneName: "Dock 3", facilityType: "warehouse" });
    expect(p).toContain('"Dock 3"');
    expect(p).toContain("warehouse");
    expect(p).toMatch(/ONLY the JSON/);
  });

  it("user prompt omits empty context", () => {
    const p = buildUserPrompt({ zoneName: "  " });
    expect(p).not.toContain("zone");
    expect(buildUserPrompt()).toMatch(/ONLY the JSON/);
  });

  it("retry prompt carries the validation errors", () => {
    const p = buildRetryPrompt("observation: Required");
    expect(p).toContain("failed validation: observation: Required");
    expect(p).toContain("Return corrected JSON only");
  });

  it("extractJson strips fences and surrounding prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Here you go:\n{"a":{"b":2}}\nThanks')).toBe('{"a":{"b":2}}');
    expect(extractJson("not json")).toBe("not json");
  });
});

// ─── cost estimate ─────────────────────────────────────────

describe("estimateCostUsd", () => {
  it("prices Claude Haiku 4.5 at $1/$5 per MTok", () => {
    expect(estimateCostUsd(ANTHROPIC_VISION_MODEL, 1_500, 300)).toBeCloseTo(0.003, 9);
  });
  it("prices gpt-4o-mini at $0.15/$0.60 per MTok", () => {
    expect(estimateCostUsd(OPENAI_VISION_MODEL, 1_500, 300)).toBeCloseTo(0.000405, 9);
  });
  it("returns 0 for unknown models rather than guessing", () => {
    expect(estimateCostUsd("some-other-model", 1_000, 1_000)).toBe(0);
  });
});

describe("bytesToBase64", () => {
  it("round-trips bytes without Buffer", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 250]);
    const b64 = bytesToBase64(bytes);
    expect(atob(b64).split("").map((c) => c.charCodeAt(0))).toEqual(Array.from(bytes));
  });
});

// ─── provider selection ────────────────────────────────────

describe("getVisionProvider", () => {
  it("prefers Anthropic when ANTHROPIC_API_KEY is set", () => {
    const p = getVisionProvider(envWith({ ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oa" }));
    expect(p?.name).toBe("anthropic");
    expect(p?.model).toBe(ANTHROPIC_VISION_MODEL);
  });
  it("falls back to OpenAI when only OPENAI_API_KEY is set", () => {
    const p = getVisionProvider(envWith({ OPENAI_API_KEY: "sk-oa" }));
    expect(p?.name).toBe("openai");
    expect(p?.model).toBe(OPENAI_VISION_MODEL);
  });
  it("returns null when neither key is set (blank strings count as unset)", () => {
    expect(getVisionProvider(envWith({ ANTHROPIC_API_KEY: "  ", OPENAI_API_KEY: "" }))).toBeNull();
    expect(getVisionProvider(envWith({}))).toBeNull();
  });
});

// ─── validate-and-retry loop ───────────────────────────────

describe("runValidatedAnalysis", () => {
  const image = { base64: "AAAA", mime: "image/jpeg" };

  it("returns the observation on first valid reply and logs one usage row", async () => {
    const caller: RawVisionCaller = vi.fn(async () => ({
      text: JSON.stringify(GOOD),
      inputTokens: 1500,
      outputTokens: 300,
    }));
    const usage: VisionCallUsage[] = [];
    const result = await runValidatedAnalysis(caller, "m", image, {
      onUsage: (u) => {
        usage.push(u);
      },
    });
    expect(result.areaType).toBe("racking_aisle");
    expect(caller).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ kind: "vision_photo", model: "m", inputTokens: 1500, outputTokens: 300 });
  });

  it("retries once with the validation errors appended, then succeeds", async () => {
    const { observation: _drop, ...bad } = GOOD;
    const calls: Parameters<RawVisionCaller>[0][] = [];
    const caller: RawVisionCaller = vi.fn(async (req) => {
      calls.push(req);
      const first = calls.length === 1;
      return {
        text: first ? "```json\n" + JSON.stringify(bad) + "\n```" : JSON.stringify(GOOD),
        inputTokens: 10,
        outputTokens: 5,
      };
    });
    const usage: VisionCallUsage[] = [];
    const result = await runValidatedAnalysis(caller, "m", image, { onUsage: (u) => { usage.push(u); } });
    expect(result.observation).toBe(GOOD.observation);
    expect(caller).toHaveBeenCalledTimes(2);
    expect(calls[0].followUp).toBeUndefined();
    expect(calls[1].followUp?.assistantText).toContain(JSON.stringify(bad));
    expect(calls[1].followUp?.userText).toMatch(/failed validation/);
    expect(calls[1].followUp?.userText).toMatch(/observation/);
    expect(usage).toHaveLength(2);
  });

  it("throws VisionParseError after the second failure", async () => {
    const caller: RawVisionCaller = vi.fn(async () => ({
      text: "I cannot see the image",
      inputTokens: 1,
      outputTokens: 1,
    }));
    await expect(runValidatedAnalysis(caller, "m", image, {})).rejects.toBeInstanceOf(VisionParseError);
    expect(caller).toHaveBeenCalledTimes(2);
  });
});

// ─── provider request/response shapes (mocked fetch) ───────

describe("anthropic provider", () => {
  it("sends a base64 image block, JSON-only system prompt, and parses usage", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe(ANTHROPIC_VISION_MODEL);
      expect(body.system).toBe(SYSTEM_PROMPT);
      expect(body.messages[0].role).toBe("user");
      expect(body.messages[0].content[0]).toEqual({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: "AAAA" },
      });
      expect(body.messages[0].content[1].type).toBe("text");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("sk-ant");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: JSON.stringify(GOOD) }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1400, output_tokens: 250 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const usage: VisionCallUsage[] = [];
    const provider = createAnthropicProvider("sk-ant", { fetch: fetchMock as unknown as typeof fetch });
    const obs = await provider.analyse(new Uint8Array([0, 0, 0]), "image/jpeg", {
      onUsage: (u) => { usage.push(u); },
    });
    expect(obs.suggestedRiskLevel).toBe("high");
    expect(usage[0]).toMatchObject({ model: ANTHROPIC_VISION_MODEL, inputTokens: 1400, outputTokens: 250 });
    expect(usage[0].costUsdEst).toBeCloseTo(0.0014 + 0.00125, 9);
  });

  it("surfaces non-OK responses with status so withRetry can classify them", async () => {
    const fetchMock = vi.fn(async () => new Response("bad key", { status: 401 }));
    const provider = createAnthropicProvider("sk-ant", {
      fetch: fetchMock as unknown as typeof fetch,
      retry: { retries: 0 },
    });
    await expect(provider.analyse(new Uint8Array([1]), "image/png", {})).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("openai provider", () => {
  it("sends a data-URL image_url part, json_object response_format, and parses usage", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe(OPENAI_VISION_MODEL);
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
      const user = body.messages[1];
      expect(user.role).toBe("user");
      expect(user.content[0].type).toBe("image_url");
      expect(user.content[0].image_url.url).toBe("data:image/png;base64,AAAA");
      const headers = init?.headers as Record<string, string>;
      expect(headers["authorization"]).toBe("Bearer sk-oa");
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: JSON.stringify(GOOD) } }],
          usage: { prompt_tokens: 900, completion_tokens: 200 },
        }),
        { status: 200 },
      );
    });
    const usage: VisionCallUsage[] = [];
    const provider = createOpenAiProvider("sk-oa", { fetch: fetchMock as unknown as typeof fetch });
    const obs = await provider.analyse(new Uint8Array([0, 0, 0]), "image/png", {
      onUsage: (u) => { usage.push(u); },
    });
    expect(obs.areaType).toBe("racking_aisle");
    expect(usage[0]).toMatchObject({ model: OPENAI_VISION_MODEL, inputTokens: 900, outputTokens: 200 });
  });
});
