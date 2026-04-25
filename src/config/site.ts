import type { Locale } from "../i18n/ui";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type SiteText = {
  metaDescription: string;
  brand: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroTag: string;
};

type SiteTextOverrides = Partial<Record<Locale, Partial<SiteText>>> & Partial<SiteText>;

type SiteConfig = {
  siteText?: SiteTextOverrides;
  text?: SiteTextOverrides;
};

const defaultSiteText: Record<Locale, SiteText> = {
  ru: {
    metaDescription: "Статический сайт конспектов, собранный из Obsidian vault.",
    brand: "notegen",
    heroEyebrow: "Обзор",
    heroTitle: "notegen",
    heroBody: "Чистое, спокойное пространство для конспектов, формул и длинного чтения.",
    heroTag: "Источник данных"
  },
  en: {
    metaDescription: "A static notes site generated from an Obsidian vault.",
    brand: "notegen",
    heroEyebrow: "Overview",
    heroTitle: "notegen",
    heroBody: "A quiet, precise surface for notes, formulas, and long-form reading.",
    heroTag: "Source"
  }
};

function readEnvValue(name: string) {
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

function readSiteConfig(): SiteConfig {
  const vaultPath = process.env.VAULT_PATH || readEnvValue("VAULT_PATH");
  const configPath = process.env.SITE_CONFIG_PATH || (vaultPath ? path.join(vaultPath, "notegen.config.json") : "");

  if (!configPath) {
    return {};
  }

  const resolvedConfigPath = path.resolve(configPath);
  if (!existsSync(resolvedConfigPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(resolvedConfigPath, "utf8")) as SiteConfig;
  } catch (error) {
    throw new Error(`Failed to parse site config at ${resolvedConfigPath}: ${String(error)}`);
  }
}

function mergeSiteText(defaults: Record<Locale, SiteText>, overrides: SiteTextOverrides = {}) {
  const globalOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([key]) => key !== "ru" && key !== "en")
  ) as Partial<SiteText>;

  return {
    ru: {
      ...defaults.ru,
      ...globalOverrides,
      ...overrides.ru
    },
    en: {
      ...defaults.en,
      ...globalOverrides,
      ...overrides.en
    }
  };
}

const siteConfig = readSiteConfig();

export const siteText: Record<Locale, SiteText> = mergeSiteText(
  defaultSiteText,
  siteConfig.siteText ?? siteConfig.text
);
