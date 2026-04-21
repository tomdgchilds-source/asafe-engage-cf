/**
 * Downloads a uniform Tabler Icons set (MIT) for the 20 Impact Calculator
 * vehicle thumbnails, writing SVG files to client/public/assets/vehicles/.
 *
 * Why this exists: the previous Wikimedia photo thumbnails looked
 * inconsistent (different lighting, backgrounds, angles) which broke
 * brand consistency on the vehicle grid. Tabler is a single icon family
 * with a uniform 2px stroke, monochrome on a 24x24 viewBox — so every
 * vehicle card gets the same pen-line treatment.
 *
 * Source list: scripts/data/vehicle-icon-set.json (kept under source
 * control so the mapping + licence trail is preserved).
 * Endpoint:    https://api.iconify.design/tabler/<name>.svg
 * Licence:     Tabler Icons — MIT.
 *
 * Usage:
 *   npx tsx scripts/downloadVehicleIcons.ts [--force]
 *
 * Re-run is idempotent; files that already exist are skipped unless
 * --force is passed.
 */
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const ICON_SET_PATH = resolve("scripts/data/vehicle-icon-set.json");
const OUT_DIR = resolve("client/public/assets/vehicles");
const APPLY_MAP_PATH = resolve("scripts/data/vehicle-image-map-local.json");
const USER_AGENT =
  "asafe-engage-cf/1.0 (https://asafe-engage.tom-d-g-childs.workers.dev; ops@asafe-engage)";
// Pacing delay between icon fetches. Iconify's CDN is generous but a
// 300ms gap keeps us well-behaved even when the script runs in CI.
const PACING_MS = 300;
// Rendered pixel size baked into the SVG width/height attrs. The
// Impact Calculator cards display thumbnails at ~80–128px; a 400px
// intrinsic size gives us crisp rendering on 2x/3x retina without
// bloating the payload (Tabler icons are ~1–2 KB each).
const RENDER_WIDTH = 400;
// Stroke colour — a near-black grey that sits well on white cards and
// doesn't fight the Tailwind text tokens. Encoded for the query string.
const STROKE_COLOR = "%23222222"; // = #222222

interface IconSetEntry {
  name: string;
  iconifyId: string; // e.g. "tabler:walk"
  filename: string; // e.g. "pedestrians.svg"
  substitution?: string;
}

function iconifyUrl(id: string): string {
  // id is "set:name" — convert to the REST path.
  const [set, name] = id.split(":");
  if (!set || !name) {
    throw new Error(`Invalid iconifyId: ${id}`);
  }
  return `https://api.iconify.design/${set}/${name}.svg?color=${STROKE_COLOR}&width=${RENDER_WIDTH}`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const raw = await readFile(ICON_SET_PATH, "utf8");
  const data = JSON.parse(raw) as {
    vehicles: IconSetEntry[];
  };

  await mkdir(OUT_DIR, { recursive: true });
  const results: Array<{
    name: string;
    filename: string;
    localPath: string;
    skipped?: boolean;
    bytes?: number;
    error?: string;
  }> = [];

  for (const v of data.vehicles) {
    const localPath = `${OUT_DIR}/${v.filename}`;
    const publicPath = `/assets/vehicles/${v.filename}`;

    if (!force && (await fileExists(localPath))) {
      results.push({ name: v.name, filename: v.filename, localPath: publicPath, skipped: true });
      console.log(`[skip] ${v.name} → ${publicPath}`);
      continue;
    }

    try {
      const url = iconifyUrl(v.iconifyId);
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        results.push({
          name: v.name,
          filename: v.filename,
          localPath: publicPath,
          error: `HTTP ${res.status}`,
        });
        console.warn(`[fail] ${v.name} (${v.iconifyId}) → HTTP ${res.status}`);
        continue;
      }
      const body = await res.text();
      // Sanity check: make sure we got an SVG back, not an error page.
      if (!body.trimStart().startsWith("<svg")) {
        results.push({
          name: v.name,
          filename: v.filename,
          localPath: publicPath,
          error: "Response did not start with <svg",
        });
        console.warn(`[fail] ${v.name} (${v.iconifyId}) → non-SVG response`);
        continue;
      }
      await writeFile(localPath, body, "utf8");
      results.push({
        name: v.name,
        filename: v.filename,
        localPath: publicPath,
        bytes: Buffer.byteLength(body, "utf8"),
      });
      console.log(`[ok]   ${v.name} → ${publicPath} (${Buffer.byteLength(body, "utf8")} bytes)`);
      await new Promise((r) => setTimeout(r, PACING_MS));
    } catch (err) {
      results.push({
        name: v.name,
        filename: v.filename,
        localPath: publicPath,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[err]  ${v.name}:`, err);
    }
  }

  // Rewrite the apply-map so /api/admin/apply-vehicle-thumbnails points
  // the DB `vehicle_types.thumbnail_url` column at the new SVG paths.
  // Vehicle names are the match key and must remain byte-identical to
  // the rows in the DB.
  const applyMap = {
    _meta: {
      generatedAt: new Date().toISOString(),
      notes:
        "Local public paths under /assets/vehicles/ served by the Cloudflare ASSETS binding. Re-generated by scripts/downloadVehicleIcons.ts.",
      iconSet: "Tabler Icons (MIT)",
    },
    vehicles: results
      .filter((r) => !r.error)
      .map((r) => ({ name: r.name, localPath: r.localPath })),
  };
  await writeFile(APPLY_MAP_PATH, JSON.stringify(applyMap, null, 2));
  console.log(`\nWrote apply-map → ${APPLY_MAP_PATH}`);

  const ok = results.filter((r) => !r.error && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.error).length;
  console.log(`\nDone: ${ok} downloaded, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
