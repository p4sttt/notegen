export type Locale = "ru" | "en";

export const defaultLocale: Locale = "ru";

type UIStrings = {
  home: string;
  subjects: string;
  notes: string;
  theme: string;
  light: string;
  dark: string;
  system: string;
  language: string;
  accent: string;
  accentWhite: string;
  accentViolet: string;
  accentTeal: string;
  accentBlue: string;
  accentOlive: string;
  accentRose: string;
  menu: string;
  empty: string;
  intro: string;
};

export const ui: Record<Locale, UIStrings> = {
  ru: {
    home: "Главная",
    subjects: "Предметы",
    notes: "Конспекты",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    system: "Системная",
    language: "Язык",
    accent: "Акцент",
    accentWhite: "Белый",
    accentViolet: "Фиолетовый",
    accentTeal: "Тёмный мятный",
    accentBlue: "Сапфировый",
    accentOlive: "Оливковый",
    accentRose: "Розовый",
    menu: "Параметры",
    empty: "Контент пока не импортирован.",
    intro: "Статический сайт конспектов, собранный из Obsidian vault."
  },
  en: {
    home: "Home",
    subjects: "Subjects",
    notes: "Notes",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    language: "Language",
    accent: "Accent",
    accentWhite: "White",
    accentViolet: "Violet",
    accentTeal: "Deep mint",
    accentBlue: "Sapphire",
    accentOlive: "Olive",
    accentRose: "Rose",
    menu: "Controls",
    empty: "Content has not been imported yet.",
    intro: "A static notes site generated from an Obsidian vault."
  }
};

export function getLocaleFromUrl(url: URL): Locale {
  const locale = url.searchParams.get("lang");
  return locale === "en" ? "en" : defaultLocale;
}
