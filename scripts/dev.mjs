import { build } from "vite";

// Separate watchers keep the React iframe out of the Svelte plugin bundle.
await build({ configFile: "vite.excalidraw.config.ts", build: { watch: {} } });
await build({ configFile: "vite.config.ts", build: { watch: {} } });
