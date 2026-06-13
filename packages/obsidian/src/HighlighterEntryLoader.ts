import type ShikiPlugin from 'packages/obsidian/src/main';
import type { HighlighterEntryModule } from 'packages/obsidian/src/highlighter-entry';

declare const require: (id: string) => unknown;

const highlighterEntryModules = new Map<string, Promise<HighlighterEntryModule>>();

export async function loadHighlighterEntry(plugin: ShikiPlugin): Promise<HighlighterEntryModule> {
	const pluginDir = plugin.manifest.dir ?? `.obsidian/plugins/${plugin.manifest.id}`;
	if (!highlighterEntryModules.has(pluginDir)) {
		highlighterEntryModules.set(
			pluginDir,
			(async (): Promise<HighlighterEntryModule> => {
				const source = await plugin.app.vault.adapter.read(`${pluginDir}/highlighter.js`);
				const module = { exports: {} as HighlighterEntryModule };
				// Obsidian does not resolve sibling plugin files through require() or import().
				// eslint-disable-next-line @typescript-eslint/no-implied-eval
				const loadModule = new Function('exports', 'module', 'require', source) as (
					exports: HighlighterEntryModule,
					module: { exports: HighlighterEntryModule },
					require: (id: string) => unknown,
				) => void;

				loadModule(module.exports, module, require);
				return module.exports;
			})(),
		);
	}

	return highlighterEntryModules.get(pluginDir)!;
}

export function clearHighlighterEntryCache(): void {
	highlighterEntryModules.clear();
}
