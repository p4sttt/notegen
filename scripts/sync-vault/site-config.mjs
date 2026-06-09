import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "./env.mjs";

function interpolateEnv(value) {
  if (typeof value === "string") {
    // Matches ${VAR_NAME} or ${VAR_NAME:-default_value}
    return value.replace(/\${([a-zA-Z0-9_]+)(?::-([^}]*))?}/g, (match, envName, fallback) => {
      const envValue = process.env[envName];
      if (envValue !== undefined) {
        return envValue;
      }
      return fallback !== undefined ? fallback : "";
    });
  }

  if (Array.isArray(value)) {
    return value.map(interpolateEnv);
  }

  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateEnv(val);
    }
    return result;
  }

  return value;
}

export function readSiteConfig(vaultPath) {
  loadEnv(); // Ensure .env is loaded into process.env

  const configPath = process.env.SITE_CONFIG_PATH || (vaultPath ? path.join(vaultPath, "notegen.config.json") : "");
  if (!configPath) {
    return {};
  }
  
  const resolvedConfigPath = path.resolve(configPath);
  if (!existsSync(resolvedConfigPath)) {
    return {};
  }

  try {
    const rawConfig = JSON.parse(readFileSync(resolvedConfigPath, "utf8"));
    return interpolateEnv(rawConfig);
  } catch (error) {
    throw new Error(`Failed to parse site config at ${resolvedConfigPath}: ${String(error)}`);
  }
}

export function resolveVaultConfigPath(vaultPath, configuredPath, fallbackPath) {
  const value = configuredPath || fallbackPath;
  return path.isAbsolute(value) ? value : path.join(vaultPath, value);
}
