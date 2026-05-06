import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function readEnvValue(name, envPath = path.resolve(".env")) {
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
