import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('obsidian', () => ({
	normalizePath(path: string): string {
		return path;
	},
}));

describe('custom theme options', () => {
	beforeEach(() => {
		// CustomThemeOptions imports Obsidian, so reset only local fake state between tests.
	});

	test('loads custom theme metadata without loading the highlighter', async () => {
		const { loadCustomThemeOptions } = await import('packages/obsidian/src/settings/CustomThemeOptions');
		const plugin = {
			loadedSettings: { customThemeFolder: 'themes' },
			app: {
				vault: {
					adapter: {
						exists: async (path: string): Promise<boolean> => path === 'themes',
						list: async (): Promise<{ files: string[]; folders: string[] }> => ({
							files: ['themes/z-theme.json', 'themes/a-theme.json', 'themes/invalid.json'],
							folders: [],
						}),
						read: async (path: string): Promise<string> => {
							if (path === 'themes/z-theme.json') return JSON.stringify({ name: 'Z Theme', colors: {} });
							if (path === 'themes/a-theme.json') return JSON.stringify({ displayName: 'A Theme', tokenColors: [] });
							return JSON.stringify({ name: 'Invalid' });
						},
					},
				},
			},
		};

		const themes = await loadCustomThemeOptions(plugin as never);

		expect(themes.map(theme => theme.name)).toEqual(['a-theme.json', 'z-theme.json']);
		expect(themes.map(theme => theme.displayName)).toEqual(['A Theme', 'Z Theme']);
		expect(themes.map(theme => theme.type)).toEqual(['both', 'both']);
	});

	test('bundled theme metadata stays aligned with Shiki bundled themes', async () => {
		const [{ bundledThemes }, { BUNDLED_THEMES_INFO }] = await Promise.all([import('shiki'), import('packages/obsidian/src/settings/BundledThemeInfo')]);

		expect(BUNDLED_THEMES_INFO.map(theme => theme.id).sort()).toEqual(Object.keys(bundledThemes).sort());
	});
});
