export type Locale = "ru" | "en";

export const defaultLocale: Locale = "ru";

type UIStrings = {
  home: string;
  topics: string;
  notes: string;
  changelog: string;
  changelogEmpty: string;
  changelogActions: {
    created: string;
    updated: string;
    deleted: string;
    renamed: string;
    changed: string;
  };
  changelogKinds: {
    note: string;
    topic: string;
    asset: string;
    other: string;
  };
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
  open: string;
  contents: string;
  notesCount: {
    one: string;
    few?: string;
    many?: string;
    other: string;
  };
  sourceData: string;
  empty: string;
  intro: string;
};

export const ui: Record<Locale, UIStrings> = {
  ru: {
    home: "Главная",
    topics: "Топики",
    notes: "Заметки",
    changelog: "Изменения",
    changelogEmpty: "Изменения пока не добавлены.",
    changelogActions: {
      created: "создано",
      updated: "изменено",
      deleted: "удалено",
      renamed: "переименовано",
      changed: "обновлено"
    },
    changelogKinds: {
      note: "заметка",
      topic: "топик",
      asset: "ассет",
      other: "объект"
    },
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
    open: "Открыть",
    contents: "Содержание",
    notesCount: {
      one: "заметка",
      few: "заметки",
      many: "заметок",
      other: "заметки"
    },
    sourceData: "Источник данных",
    empty: "Контент пока не импортирован.",
    intro: "Статический сайт конспектов, собранный из Obsidian vault."
  },
  en: {
    home: "Home",
    topics: "Topics",
    notes: "Notes",
    changelog: "Changelog",
    changelogEmpty: "No changes have been added yet.",
    changelogActions: {
      created: "created",
      updated: "updated",
      deleted: "deleted",
      renamed: "renamed",
      changed: "changed"
    },
    changelogKinds: {
      note: "note",
      topic: "topic",
      asset: "asset",
      other: "item"
    },
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
    open: "Open",
    contents: "Contents",
    notesCount: {
      one: "note",
      other: "notes"
    },
    sourceData: "Source",
    empty: "Content has not been imported yet.",
    intro: "A static notes site generated from an Obsidian vault."
  }
};

export function getLocaleFromUrl(url: URL): Locale {
  const locale = url.searchParams.get("lang");
  return locale === "en" ? "en" : defaultLocale;
}

export function formatNotesCount(locale: Locale, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  const forms = ui[locale].notesCount;
  const label = forms[category as keyof typeof forms] ?? forms.other;
  return `${count} ${label}`;
}
