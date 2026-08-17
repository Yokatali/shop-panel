import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ShopProvider } from "./data/store";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShopProvider>
      <App />
    </ShopProvider>
  </StrictMode>,
);
