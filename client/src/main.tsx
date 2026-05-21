import "./index.css";
import App from "./App";
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
