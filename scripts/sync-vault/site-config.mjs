import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function readSiteConfig(vaultPath) {
  const configPath = process.env.SITE_CONFIG_PATH || path.join(vaultPath, "notegen.config.json");
  const resolvedConfigPath = path.resolve(configPath);

  if (!existsSync(resolvedConfigPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse site config at ${resolvedConfigPath}: ${String(error)}`);
  }
}

export function resolveVaultConfigPath(vaultPath, configuredPath, fallbackPath) {
  const value = configuredPath || fallbackPath;
  return path.isAbsolute(value) ? value : path.join(vaultPath, value);
}
