import type { Locale } from "../i18n/ui";

type SiteText = {
  metaDescription: string;
  brand: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  heroTag: string;
};

export const siteText: Record<Locale, SiteText> = {
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
