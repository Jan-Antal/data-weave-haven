import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const expectedProductionOrigin = "https://data-weave-haven.lovable.app";
if (window.location.origin !== expectedProductionOrigin) {
  console.warn(
    `[Auth] Current origin (${window.location.origin}) differs from expected production origin (${expectedProductionOrigin}). Ensure backend auth URL configuration includes this domain.`
  );
}

createRoot(document.getElementById("root")!).render(<App />);
