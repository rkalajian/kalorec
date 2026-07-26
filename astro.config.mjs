import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: netlify(),
  image: {
    // Recipe images come from whatever site a recipe was imported from —
    // any https host, not a known/fixed set — so allow all of them.
    remotePatterns: [{ protocol: "https" }],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
