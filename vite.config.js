import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: [".web.js", ".web.jsx", ".web.ts", ".web.tsx", ".mjs", ".js", ".jsx", ".ts", ".tsx", ".json"],
    alias: [
      {
        find: /^react-native-svg$/,
        replacement: path.resolve(__dirname, "node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js"),
      },
      {
        find: /^react-native$/,
        replacement: path.resolve(__dirname, "node_modules/react-native-web"),
      },
      {
        find: /^react-native\/Libraries\/(.*)/,
        replacement: path.resolve(__dirname, "./rn-internals-stub.js"),
      },
      {
        find: /^react-native\/(.*)/,
        replacement: path.resolve(__dirname, "node_modules/react-native-web/$1"),
      },
    ],
  },
  build: {
    outDir: "dist",
  },
});
