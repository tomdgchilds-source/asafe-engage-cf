// Install the image-import loader hook so `import logo from '...png'` works
// when running the PDF harness under plain Node (no Vite). Used by
// scripts/testPdfGenerators.ts via:
//   npx tsx --import ./scripts/testPdfGenerators.loaderInstall.mjs scripts/testPdfGenerators.ts
import { register } from "node:module";

const loaderUrl = new URL("./testPdfGenerators.loader.mjs", import.meta.url);
register(loaderUrl.href);
