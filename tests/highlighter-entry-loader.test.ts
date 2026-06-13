import { afterEach, describe, expect, test } from 'bun:test';
import { clearHighlighterEntryCache, loadHighlighterEntry } from 'packages/obsidian/src/HighlighterEntryLoader';

describe('highlighter entry loader', () => {
	afterEach(() => {
		clearHighlighterEntryCache();
	});

	test('loads sidecar from plugin manifest directory through vault adapter', async () => {
		clearHighlighterEntryCache();
		const requestedPaths: string[] = [];
		const plugin = {
			manifest: { id: 'shiki-highlighter', dir: '.obsidian/plugins/shiki-highlighter' },
			app: {
				vault: {
					adapter: {
						read: async (path: string): Promise<string> => {
							requestedPaths.push(path);
							return 'exports.CodeHighlighter = class CodeHighlighter {}; exports.createCm6Plugin = () => \"cm6\"; exports.filterHighlightAllPlugin = () => \"prism\";';
						},
					},
				},
			},
		};

		const entry = await loadHighlighterEntry(plugin as never);

		expect(requestedPaths).toEqual(['.obsidian/plugins/shiki-highlighter/highlighter.js']);
		expect(entry.CodeHighlighter.name).toBe('CodeHighlighter');
		expect((entry.createCm6Plugin as unknown as () => string)()).toBe('cm6');
		expect((entry.filterHighlightAllPlugin as unknown as () => string)()).toBe('prism');
	});

	test('caches sidecar per plugin directory', async () => {
		clearHighlighterEntryCache();
		const requestedPaths: string[] = [];
		const createPlugin = (dir: string): unknown => ({
			manifest: { id: 'shiki-highlighter', dir },
			app: {
				vault: {
					adapter: {
						read: async (path: string): Promise<string> => {
							requestedPaths.push(path);
							return `exports.CodeHighlighter = class ${dir.endsWith('one') ? 'One' : 'Two'} {}; exports.createCm6Plugin = () => null; exports.filterHighlightAllPlugin = () => null;`;
						},
					},
				},
			},
		});

		await loadHighlighterEntry(createPlugin('.obsidian/plugins/one') as never);
		await loadHighlighterEntry(createPlugin('.obsidian/plugins/one') as never);
		await loadHighlighterEntry(createPlugin('.obsidian/plugins/two') as never);

		expect(requestedPaths).toEqual(['.obsidian/plugins/one/highlighter.js', '.obsidian/plugins/two/highlighter.js']);
	});
});
