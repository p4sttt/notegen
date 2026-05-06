import { mkdirSync } from "node:fs";
import path from "node:path";

export function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}
