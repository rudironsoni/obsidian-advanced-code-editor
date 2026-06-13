import { normalizePath } from 'obsidian';
import type ShikiPlugin from 'packages/obsidian/src/main';
import type { CustomTheme } from 'packages/obsidian/src/Highlighter';

export async function loadCustomThemeOptions(plugin: ShikiPlugin): Promise<CustomTheme[]> {
	if (!plugin.loadedSettings.customThemeFolder) {
		return [];
	}

	const themeFolder = normalizePath(plugin.loadedSettings.customThemeFolder);
	if (!(await plugin.app.vault.adapter.exists(themeFolder))) {
		return [];
	}

	const themeList = await plugin.app.vault.adapter.list(themeFolder);
	const themeFiles = themeList.files.filter(f => f.toLowerCase().endsWith('.json'));
	const themes: CustomTheme[] = [];

	for (const themeFile of themeFiles) {
		const baseName = themeFile.substring(`${themeFolder}/`.length);
		try {
			const theme = JSON.parse(await plugin.app.vault.adapter.read(themeFile)) as CustomTheme;
			if (!theme.colors && !theme.tokenColors) {
				continue;
			}

			theme.displayName = theme.displayName ?? theme.name ?? baseName;
			theme.name = baseName.toLowerCase();
			theme.type = theme.type ?? 'both';
			themes.push(theme);
		} catch (e) {
			console.warn(`Unable to load custom theme option: ${themeFile}`, e);
		}
	}

	return themes.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
