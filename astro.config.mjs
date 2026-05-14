import { defineConfig } from "astro/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkLinkChips from "./src/markdown/remark-link-chips.mjs";

function readEnvValue(name) {
  const envPath = path.resolve(".env");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const envContent = readFileSync(envPath, "utf8");
  for (const rawLine of envContent.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }

  return undefined;
}

function getSiteConfigPath() {
  const vaultPath = process.env.VAULT_PATH || readEnvValue("VAULT_PATH");
  const configuredPath = process.env.SITE_CONFIG_PATH || readEnvValue("SITE_CONFIG_PATH");
  const configPath = configuredPath || (vaultPath ? path.join(vaultPath, "notegen.config.json") : "");
  return configPath ? path.resolve(configPath) : undefined;
}

function notegenSiteConfigWatcher() {
  const configPath = getSiteConfigPath();

  return {
    name: "notegen-site-config-watcher",
    configureServer(server) {
      if (!configPath) {
        return;
      }

      server.watcher.add(configPath);
      server.watcher.on("change", async (changedPath) => {
        if (path.resolve(changedPath) !== configPath) {
          return;
        }

        await server.restart();
      });
    }
  };
}

export default defineConfig({
  site: process.env.ASTRO_SITE || "https://example.github.io",
  base: process.env.ASTRO_BASE || "/notegen",
  output: "static",
  vite: {
    plugins: [notegenSiteConfigWatcher()]
  },
  markdown: {
    syntaxHighlight: "shiki",
    remarkPlugins: [remarkMath, remarkLinkChips],
    rehypePlugins: [rehypeKatex],
    shikiConfig: {
      themes: {
        light: "light-plus",
        dark: "gruvbox-dark-medium"
      },
      defaultColor: false
    }
  }
});
