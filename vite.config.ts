import { defineConfig } from "vite";

// The site has more than one page. Each page is an HTML file listed here.
// To add a page (e.g. an About page), create about/index.html and add it below.
export default defineConfig({
  build: {
    rolldownOptions: {
      input: {
        home: "index.html",
        play: "play/index.html",
        private: "private/index.html",
      },
    },
  },
  server: {
    // Private games talk to the game server (src/server) over /ws.
    proxy: {
      "/ws": { target: "ws://localhost:3001", ws: true },
    },
  },
});
