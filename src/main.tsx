import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapCacheCheck } from "./lib/cacheBuster";

const expectedProductionOrigin = "https://projekty.am-interior.cz";
if (window.location.origin !== expectedProductionOrigin && !window.location.origin.includes("lovable.app")) {
  console.warn(
    `[Auth] Current origin (${window.location.origin}) differs from expected production origin (${expectedProductionOrigin}). Ensure backend auth URL configuration includes this domain.`
  );
}

// Detect new build and clear stale PWA caches before mounting React.
bootstrapCacheCheck().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
