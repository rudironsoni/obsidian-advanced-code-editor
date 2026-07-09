import { describe, expect, test } from 'bun:test';
import { resolveThemeConfirmation, validateCustomThemeFolder, type ThemeFolderAdapter } from 'packages/obsidian/src/settings/ThemeConfidence';

function createAdapter(files: Record<string, string>): ThemeFolderAdapter {
	return {
		async exists(path: string): Promise<boolean> {
			return path === 'customThemes' || Object.hasOwn(files, path);
		},
		async list(path: string): Promise<{ files: string[]; folders: string[] }> {
			const prefix = `${path}/`;
			return {
				files: Object.keys(files).filter(file => file.startsWith(prefix)),
				folders: [],
			};
		},
		async read(path: string): Promise<string> {
			const file = files[path];
			if (file === undefined) {
				throw new Error(`Missing fixture file: ${path}`);
			}
			return file;
		},
	};
}

describe('theme confidence helpers', () => {
	test('resolves Obsidian-theme defaults to effective bundled dark and light themes', () => {
		const dark = resolveThemeConfirmation('obsidian-theme', 'dark');
		const light = resolveThemeConfirmation('obsidian-theme', 'light');

		expect(dark.usesObsidianTheme).toBe(true);
		expect(dark.configuredThemeLabel).toBe('Obsidian built-in');
		expect(dark.effectiveThemeId).toBe('github-dark');
		expect(dark.effectiveThemeLabel).toBe('GitHub Dark');
		expect(dark.message).toContain('GitHub Dark');

		expect(light.usesObsidianTheme).toBe(true);
		expect(light.effectiveThemeId).toBe('github-light');
		expect(light.effectiveThemeLabel).toBe('GitHub Light');
		expect(light.message).toContain('GitHub Light');
	});

	test('keeps explicitly selected bundled themes visible', () => {
		const confirmation = resolveThemeConfirmation('monokai', 'dark');

		expect(confirmation.usesObsidianTheme).toBe(false);
		expect(confirmation.configuredThemeLabel).toBe('Monokai');
		expect(confirmation.effectiveThemeId).toBe('monokai');
		expect(confirmation.message).toBe('Monokai is active for dark mode.');
	});

	test('reports an empty custom theme folder as neutral', async () => {
		const validation = await validateCustomThemeFolder(createAdapter({}), '');

		expect(validation.state).toBe('empty');
		expect(validation.loadableThemes).toEqual([]);
		expect(validation.message).toContain('No custom theme folder configured');
	});

	test('reports a missing custom theme folder', async () => {
		const validation = await validateCustomThemeFolder(createAdapter({}), 'missingThemes');

		expect(validation.state).toBe('missing');
		expect(validation.folder).toBe('missingThemes');
		expect(validation.loadableThemes).toEqual([]);
	});

	test('reports folders without loadable JSON themes as invalid', async () => {
		const validation = await validateCustomThemeFolder(
			createAdapter({
				'customThemes/readme.txt': 'not a theme',
				'customThemes/broken.json': '{',
				'customThemes/plain.json': '{"name":"Plain"}',
			}),
			'customThemes',
		);

		expect(validation.state).toBe('invalid');
		expect(validation.jsonFileCount).toBe(2);
		expect(validation.loadableThemes).toEqual([]);
		expect(validation.invalidFiles).toEqual(['customThemes/broken.json', 'customThemes/plain.json']);
	});

	test('reports unreadable custom theme folders as invalid', async () => {
		const adapter = createAdapter({});
		adapter.exists = async () => true;
		adapter.list = async () => {
			throw new Error('Not a folder');
		};

		const validation = await validateCustomThemeFolder(adapter, 'customThemes');

		expect(validation.state).toBe('invalid');
		expect(validation.message).toContain('Unable to read custom theme folder');
	});

	test('counts parseable VS Code style theme JSON files as loadable', async () => {
		const validation = await validateCustomThemeFolder(
			createAdapter({
				'customThemes/OneMonokai-color-theme.json': JSON.stringify({
					name: 'One Monokai',
					type: 'dark',
					colors: {},
					tokenColors: [],
				}),
			}),
			'customThemes',
		);

		expect(validation.state).toBe('valid');
		expect(validation.jsonFileCount).toBe(1);
		expect(validation.loadableThemes).toEqual(['One Monokai']);
		expect(validation.message).toContain('1 loadable custom theme found');
	});
});
