import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

const clientPublicDir = path.resolve(import.meta.dirname, "client", "public");
const clientOutDir = path.resolve(import.meta.dirname, "dist/client");

/**
 * Stamp the service worker with a build-time version. Vite copies
 * client/public/sw.js into dist/client verbatim before closeBundle runs,
 * so we re-read the source, substitute __SW_VERSION__ and overwrite the
 * copied file. A new VERSION on every build means the SW's activate step
 * drops the previous release's caches.
 */
function swVersion(): Plugin {
  return {
    name: "asafe-sw-version",
    apply: "build",
    closeBundle() {
      const src = path.join(clientPublicDir, "sw.js");
      const dest = path.join(clientOutDir, "sw.js");
      if (!fs.existsSync(src)) return;
      const version = Date.now().toString(36);
      const out = fs.readFileSync(src, "utf8").replace(/__SW_VERSION__/g, version);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, out);
    },
  };
}

export default defineConfig({
  plugins: [react(), swVersion()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: clientOutDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-dom/client"],
          "vendor-radix": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-visually-hidden",
          ],
          "vendor-tanstack": ["@tanstack/react-query"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod", "zod-validation-error"],
          "vendor-motion": ["framer-motion"],
          "vendor-charts": ["recharts"],
          "vendor-pdf-viewer": ["react-pdf"],
          "vendor-uppy": [
            "@uppy/core",
            "@uppy/react",
            "@uppy/aws-s3",
            "@uppy/dashboard",
            "@uppy/drag-drop",
            "@uppy/file-input",
            "@uppy/progress-bar",
            "@uppy/webcam",
          ],
          "vendor-utils": ["date-fns", "clsx", "tailwind-merge", "class-variance-authority"],
        },
      },
    },
  },
});
