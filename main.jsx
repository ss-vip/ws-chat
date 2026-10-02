import React from "react";
import { createRoot } from "react-dom/client";
import { TamaguiProvider, Theme } from "tamagui";
import config from "./tamagui.config";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <TamaguiProvider config={config} defaultTheme="light">
    <Theme name="light">
      <App />
    </Theme>
  </TamaguiProvider>
);
