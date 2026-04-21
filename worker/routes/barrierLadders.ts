import { Hono } from "hono";
import type { Env, Variables } from "../types";
import laddersJson from "../../scripts/data/barrier-ladders.json";

const ladders = new Hono<{ Bindings: Env; Variables: Variables }>();

// Public read-only: the ladders drive client-side UI (cart tier-switcher,
// Impact Calculator recommendations, order-form PDF), so no auth gate.
// Edge-cached for 5 minutes since the fixture is static and bundled into
// the Worker — clients can safely cache aggressively.
ladders.get("/barrier-ladders", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  return c.json(laddersJson);
});

export default ladders;
