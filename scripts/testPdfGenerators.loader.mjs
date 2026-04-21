// Node ESM loader hook used by scripts/testPdfGenerators.ts to resolve
// Vite-style image imports ("import asafeLogoImg from '../../../attached_assets/*.png'")
// when we run the generators under plain Node. Vite normally turns these into
// URL strings at build time; in Node we can't fall through to Vite, so we
// synthesize a JS module whose default export is a small data URL. Any image
// downstream will hit our fetch() shim anyway — the only thing that matters
// here is that the ES import resolves without an "Unknown file extension .png"
// error.
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

// Tiny 1x1 transparent PNG as data URL. Matches the one the fetch mock serves
// for uploaded images, so the generator sees consistent content regardless of
// whether an image came via import or URL.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export async function resolve(specifier, context, nextResolve) {
  // Redirect the "jspdf" import to its ES module build. Under Node, the
  // "node" export condition selects jspdf.node.min.js (CJS), whose default
  // export is the module.exports object itself — so `import jsPDF from
  // "jspdf"` returns an object, not the constructor, and `new jsPDF()`
  // throws "jsPDF is not a constructor" in the generator. Point the
  // resolver at the browser ESM build (which exports jsPDF as default
  // correctly) so the generator code works unchanged.
  if (specifier === "jspdf") {
    const resolved = await nextResolve(
      "jspdf/dist/jspdf.es.min.js",
      context,
    );
    // Mark as "module" so Node parses it as ESM even though its
    // package.json has no `"type": "module"` and the filename is `.js`.
    // Without this, Node/tsx treats the .js file as CJS, yields
    // { default, "module.exports" } on import, and `new jsPDF()` throws.
    return {
      ...resolved,
      format: "module",
      shortCircuit: true,
    };
  }
  if (IMAGE_EXT_RE.test(specifier)) {
    // Resolve the path relative to parent URL so we can at least attempt to
    // read the real asset bytes (and base64-encode them) when it exists. If
    // the file isn't accessible we still return the sentinel fake URL so the
    // generator treats it as a loadable image via fetch().
    let resolvedUrl;
    try {
      const parentURL = context.parentURL
        ? new URL(context.parentURL)
        : pathToFileURL(`${process.cwd()}/`);
      resolvedUrl = new URL(specifier, parentURL).href;
    } catch {
      resolvedUrl = `file:///fake-image${specifier}`;
    }
    return {
      url: `asafe-image:${resolvedUrl}`,
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("asafe-image:")) {
    const realUrl = url.slice("asafe-image:".length);
    // Best-effort read the real image bytes and build a real data URL so the
    // logo actually looks like the logo. Fall back to a transparent 1x1.
    let dataUrl = TINY_PNG_DATA_URL;
    try {
      const path = fileURLToPath(realUrl);
      const buf = await readFile(path);
      const lower = path.toLowerCase();
      const mime = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : lower.endsWith(".webp")
            ? "image/webp"
            : lower.endsWith(".gif")
              ? "image/gif"
              : "image/png";
      dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      // leave as transparent placeholder
    }
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(dataUrl)};`,
    };
  }
  return nextLoad(url, context);
}
