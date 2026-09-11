import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Chunk-load recovery. After a deploy the hashed chunk a lazy route wants
// may no longer exist; Vite surfaces that as a `vite:preloadError`. Reload
// once, which pulls the new index.html and its fresh chunk manifest. A
// sessionStorage guard stops a genuinely broken build from looping: on
// the second failure we let the error propagate to the ErrorBoundary.
const RELOADED_FOR_CHUNK_KEY = "asafe:reloaded-for-chunk";
const readGuard = () => {
  try { return sessionStorage.getItem(RELOADED_FOR_CHUNK_KEY); } catch { return null; }
};
window.addEventListener("vite:preloadError", (e) => {
  if (readGuard()) return; // already reloaded once this session — surface the error
  e.preventDefault();
  try { sessionStorage.setItem(RELOADED_FOR_CHUNK_KEY, "1"); } catch {}
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);

// Once the app has been up long enough for the initial route's chunks to
// have loaded (or failed), clear the guard so the *next* deploy is also
// allowed one recovery reload. Clearing synchronously at mount would let
// a still-failing chunk reload forever, because lazy chunks load after
// mount.
window.setTimeout(() => {
  try { sessionStorage.removeItem(RELOADED_FOR_CHUNK_KEY); } catch {}
}, 30_000);
