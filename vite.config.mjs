import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// production build 會把 process.env.* 靜態替換，dev 不會；
// Tamagui 的瀏覽器碼會直接讀取這些變數，未替換會在瀏覽器拋 ReferenceError（整頁掛掉）
const DEV_BROWSER_ENV = Object.fromEntries(
  [
    "IS_STATIC",
    "TEST_NATIVE_PLATFORM",
    "TAMAGUI_BAIL_AFTER_SCANNING_X_CSS_RULES",
    "TAMAGUI_CSS_VARIABLE_PREFIX",
    "TAMAGUI_DEFAULT_COLOR",
    "TAMAGUI_DID_OUTPUT_CSS",
    "TAMAGUI_DYNAMIC_COLOR_IOS",
    "TAMAGUI_HEADLESS",
    "TAMAGUI_INSERT_SELECTOR_TRIES",
    "TAMAGUI_LAYOUT_FRAME_SKIP",
    "TAMAGUI_MEMOIZE_STYLEABLE",
    "TAMAGUI_ONLAYOUT_PRETRANSFORM",
    "TAMAGUI_OPTIMIZE_THEMES",
    "TAMAGUI_RNGH_PRESS_DELAY",
    "TAMAGUI_STACK_Z_INDEX_GLOBAL",
    "TAMAGUI_TARGET",
    "TAMAGUI_TOKEN_PREFIX",
    "TAMAGUI_WARN_ON_MISSING_VARIANT",
  ].map((key) => [`process.env.${key}`, "undefined"])
);

const rootDir = import.meta.dirname;

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // dev 必須 shim，否則 Tamagui 的預打包碼會在瀏覽器拋 process is not defined
  define: command === "serve" ? DEV_BROWSER_ENV : {},
  server: {
    // dev 模式把 /ws 轉發到本機 server（正式環境同源直連，不需此設定）
    proxy: {
      "/ws": {
        target: `ws://localhost:${process.env.PORT || 8080}`,
        ws: true,
      },
    },
  },
  resolve: {
    extensions: [".web.js", ".web.jsx", ".web.ts", ".web.tsx", ".mjs", ".js", ".jsx", ".ts", ".tsx", ".json"],
    alias: [
      {
        find: /^react-native$/,
        replacement: path.resolve(rootDir, "node_modules/react-native-web"),
      },
      {
        find: /^react-native\/Libraries\/(.*)/,
        replacement: path.resolve(rootDir, "./rn-internals-stub.js"),
      },
      {
        find: /^react-native\/(.*)/,
        replacement: path.resolve(rootDir, "node_modules/react-native-web/$1"),
      },
    ],
  },
  build: {
    outDir: "dist",
  },
}));
