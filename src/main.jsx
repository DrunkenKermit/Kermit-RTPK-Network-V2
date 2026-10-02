import { createRoot } from "react-dom/client";

// Minimal React shell. The product UI is the existing static site that the
// Vite build copies into dist/ verbatim; this entry exists so the project is a
// real Vite + React build and hosting can detect a supported framework.
function Shell() {
  return null;
}

export function mountWrapper(el) {
  createRoot(el).render(<Shell />);
}

export default Shell;
