// ────────────────────────────────────────────────────────────────────────────
// scripts/uploadBrandFonts.ts
//
// Uploads the Inter static TTFs the PDF renderer embeds (worker/lib/pdf/
// fonts.ts) to R2 at brand/fonts/Inter-{Regular,SemiBold,Bold}.ttf. The
// fonts are deliberately not committed to git and not bundled into the
// Worker: they are fetched from R2 once per isolate.
//
// Source: the official release zip at https://github.com/rsms/inter/releases
// (Inter is SIL OFL 1.1). Extract extras/ttf/Inter-Regular.ttf,
// Inter-SemiBold.ttf and Inter-Bold.ttf into one directory, then:
//
//   npx tsx scripts/uploadBrandFonts.ts /path/to/dir-with-ttfs
//
// Uses the wrangler login on this machine; add --local to target the
// `wrangler dev` local store instead of the real bucket.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const BUCKET = "asafe-engage-files";
const FILES = ["Inter-Regular.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"] as const;
const PREFIX = "brand/fonts";

const args = process.argv.slice(2);
const local = args.includes("--local");
const dirArg = args.find((a) => !a.startsWith("--"));
if (!dirArg) {
  console.error("usage: npx tsx scripts/uploadBrandFonts.ts <dir containing Inter-Regular/SemiBold/Bold.ttf> [--local]");
  process.exit(2);
}
const dir = resolve(dirArg);

let failed = false;
for (const name of FILES) {
  const file = resolve(dir, name);
  if (!existsSync(file)) {
    console.error(`missing ${file}`);
    failed = true;
    continue;
  }
  const size = statSync(file).size;
  const key = `${BUCKET}/${PREFIX}/${name}`;
  const wranglerArgs = ["wrangler", "r2", "object", "put", key, "--file", file, "--content-type", "font/ttf"];
  if (local) wranglerArgs.push("--local");
  console.log(`→ ${key} (${size.toLocaleString()} bytes)`);
  const result = spawnSync("npx", wranglerArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`upload failed for ${name} (exit ${result.status ?? "signal"})`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`done — ${FILES.length} fonts in r2://${BUCKET}/${PREFIX}/`);
