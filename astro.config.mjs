import { defineConfig } from "astro/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkLinkChips from "./src/markdown/remark-link-chips.mjs";

export default defineConfig({
  site: process.env.ASTRO_SITE || "https://example.github.io",
  base: process.env.ASTRO_BASE || "/notegen",
  output: "static",
  markdown: {
    syntaxHighlight: "shiki",
    remarkPlugins: [remarkMath, remarkLinkChips],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark"
      },
      defaultColor: false
    }
  }
});
