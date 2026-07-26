import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readSiteConfig } from './site-config.mjs';

export class PluginContext {
  constructor(siteConfig, vaultPath) {
    this.siteConfig = siteConfig;
    this.vaultPath = vaultPath;
    this.registries = new Map();

    // UI Extension points
    this.ui = {
      headerLinks: [],
      preferencesSections: [],
      scripts: [],
      styles: [],
    };
  }

  set(key, value) {
    this.registries.set(key, value);
  }

  get(key) {
    return this.registries.get(key);
  }

  registerHeaderLink(link) {
    // link: { label: string, href: string, i18n?: { ru: string, en: string } }
    this.ui.headerLinks.push(link);
  }

  registerPreferencesSection(section) {
    // section: { title: string, html: string, i18n?: { ru: string, en: string } }
    this.ui.preferencesSections.push(section);
  }

  registerGlobalScript(script) {
    this.ui.scripts.push(script);
  }

  registerGlobalStyle(style) {
    this.ui.styles.push(style);
  }
}

export function writePluginsUiFile(uiRegistry) {
  const filePath = path.resolve('src/data/generated/plugins-ui.ts');
  const dirPath = path.dirname(filePath);
  if (!existsSync(dirPath)) {
    // Ensure parent dir exists
    import('node:fs').then((fs) => fs.mkdirSync(dirPath, { recursive: true }));
  }
  const content = `// Generated file. Do not edit.
export const pluginsUi = ${JSON.stringify(uiRegistry, null, 2)};
`;
  writeFileSync(filePath, content, 'utf8');
}

export async function loadPlugins(vaultPath) {
  const siteConfig = readSiteConfig(vaultPath);
  const pluginsConfig = siteConfig.plugins || {};
  const loadedPlugins = [];
  const projectRoot = path.resolve('.');
  let pluginsDir = path.join(projectRoot, '.plugins');
  if (!existsSync(pluginsDir)) {
    pluginsDir = path.join(projectRoot, 'plugins');
  }

  for (const [pluginName, pluginOptions] of Object.entries(pluginsConfig)) {
    const pluginPath = path.join(pluginsDir, pluginName);
    if (!existsSync(pluginPath)) {
      console.warn(`[Plugins] Plugin directory not found: ${pluginPath}`);
      continue;
    }

    let entrypoint = 'index.js';
    const packageJsonPath = path.join(pluginPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (pkg.main) {
          entrypoint = pkg.main;
        }
      } catch (err) {
        console.error(`[Plugins] Failed to parse package.json for plugin ${pluginName}:`, err);
      }
    }

    const resolvedEntrypoint = path.resolve(pluginPath, entrypoint);
    if (!existsSync(resolvedEntrypoint)) {
      console.warn(
        `[Plugins] Entrypoint not found for plugin ${pluginName}: ${resolvedEntrypoint}`,
      );
      continue;
    }

    try {
      const fileUrl = new URL(`file://${resolvedEntrypoint}`).href;
      const pluginModule = await import(fileUrl);
      const pluginCreator = pluginModule.default || pluginModule;

      const pluginInstance =
        typeof pluginCreator === 'function' ? pluginCreator(pluginOptions) : pluginCreator;

      loadedPlugins.push({
        name: pluginName,
        options: pluginOptions,
        instance: pluginInstance,
      });
      console.log(`[Plugins] Loaded plugin: ${pluginName}`);
    } catch (err) {
      console.error(`[Plugins] Failed to load plugin ${pluginName}:`, err);
    }
  }

  return {
    plugins: loadedPlugins,

    async runBeforeSync(context) {
      for (const p of loadedPlugins) {
        if (typeof p.instance.beforeSync === 'function') {
          await p.instance.beforeSync(context);
        }
      }
    },

    async runProcessNote(note, context) {
      let currentNote = note;
      for (const p of loadedPlugins) {
        if (typeof p.instance.processNote === 'function') {
          const result = await p.instance.processNote(currentNote, context);
          if (result !== undefined) {
            currentNote = result;
          }
        }
      }
      return currentNote;
    },

    async runProcessDatabase(database, context) {
      let currentDatabase = database;
      for (const p of loadedPlugins) {
        if (typeof p.instance.processDatabase === 'function') {
          const result = await p.instance.processDatabase(currentDatabase, context);
          if (result !== undefined) {
            currentDatabase = result;
          }
        }
      }
      return currentDatabase;
    },

    async runAfterSync(context, topics, topLevelNotes, topLevelDatabases) {
      for (const p of loadedPlugins) {
        if (typeof p.instance.afterSync === 'function') {
          await p.instance.afterSync({
            context,
            topics,
            topLevelNotes,
            topLevelDatabases,
          });
        }
      }
    },

    getAstroConfigs() {
      const integrations = [];
      const remarkPlugins = [];
      const rehypePlugins = [];
      const shikiConfigs = [];

      for (const p of loadedPlugins) {
        const astroConfig = p.instance.astro;
        if (astroConfig) {
          if (Array.isArray(astroConfig.integrations)) {
            integrations.push(...astroConfig.integrations);
          }
          if (Array.isArray(astroConfig.remarkPlugins)) {
            remarkPlugins.push(...astroConfig.remarkPlugins);
          }
          if (Array.isArray(astroConfig.rehypePlugins)) {
            rehypePlugins.push(...astroConfig.rehypePlugins);
          }
          if (astroConfig.shikiConfig) {
            shikiConfigs.push(astroConfig.shikiConfig);
          }
        }
      }

      return {
        integrations,
        remarkPlugins,
        rehypePlugins,
        shikiConfigs,
      };
    },
  };
}
