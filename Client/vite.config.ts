import { defineConfig } from "vite";

// Builds the single dashboard entry into the package's wwwroot so it ships in the .nupkg.
// The Umbraco backoffice (@umbraco-cms/*) is provided by the host at runtime — never bundle it.
export default defineConfig({
  esbuild: {
    target: "es2022",
  },
  build: {
    lib: {
      entry: "src/dashboard/cacheManager.element.ts",
      formats: ["es"],
      fileName: () => "cacheManager.element.js",
    },
    outDir: "../wwwroot/App_Plugins/CacheManager",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      external: [/^@umbraco\//, /^@umbraco-cms\//],
    },
  },
  base: "/App_Plugins/CacheManager/",
});
