import { OBSIDIAN_THEME_IDENTIFIER } from 'packages/obsidian/src/Constants';
import { BUNDLED_THEMES_INFO } from 'packages/obsidian/src/settings/BundledThemeInfo';

export type ThemeMode = 'dark' | 'light';

export interface ThemeConfirmation {
	mode: ThemeMode;
	configuredThemeId: string;
	configuredThemeLabel: string;
	effectiveThemeId: string;
	effectiveThemeLabel: string;
	usesObsidianTheme: boolean;
	message: string;
}

export type CustomThemeFolderValidationState = 'empty' | 'valid' | 'missing' | 'invalid';

export interface CustomThemeFolderValidation {
	state: CustomThemeFolderValidationState;
	message: string;
	folder: string;
	loadableThemes: string[];
	invalidFiles: string[];
	jsonFileCount: number;
}

export interface ThemeFolderAdapter {
	exists(path: string): Promise<boolean>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	read(path: string): Promise<string>;
}

const OBSIDIAN_THEME_FALLBACKS: Record<ThemeMode, string> = {
	dark: 'github-dark',
	light: 'github-light',
};

const THEME_LABELS = new Map(BUNDLED_THEMES_INFO.map(theme => [theme.id, theme.displayName]));

export function resolveThemeConfirmation(configuredThemeId: string, mode: ThemeMode): ThemeConfirmation {
	const usesObsidianTheme = configuredThemeId === OBSIDIAN_THEME_IDENTIFIER;
	const effectiveThemeId = usesObsidianTheme ? OBSIDIAN_THEME_FALLBACKS[mode] : configuredThemeId;
	const configuredThemeLabel = usesObsidianTheme ? 'Obsidian built-in' : getThemeLabel(configuredThemeId);
	const effectiveThemeLabel = getThemeLabel(effectiveThemeId);
	const message = usesObsidianTheme
		? `${configuredThemeLabel} uses ${effectiveThemeLabel} for ${mode} mode.`
		: `${effectiveThemeLabel} is active for ${mode} mode.`;

	return {
		mode,
		configuredThemeId,
		configuredThemeLabel,
		effectiveThemeId,
		effectiveThemeLabel,
		usesObsidianTheme,
		message,
	};
}

export async function validateCustomThemeFolder(adapter: ThemeFolderAdapter, folder: string): Promise<CustomThemeFolderValidation> {
	const normalizedFolder = folder.trim();
	if (!normalizedFolder) {
		return {
			state: 'empty',
			message: 'No custom theme folder configured.',
			folder: '',
			loadableThemes: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}

	if (!(await adapter.exists(normalizedFolder))) {
		return {
			state: 'missing',
			message: `Custom theme folder not found: ${normalizedFolder}`,
			folder: normalizedFolder,
			loadableThemes: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}

	let listing: { files: string[]; folders: string[] };
	try {
		listing = await adapter.list(normalizedFolder);
	} catch {
		return {
			state: 'invalid',
			message: `Unable to read custom theme folder: ${normalizedFolder}`,
			folder: normalizedFolder,
			loadableThemes: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}
	const jsonFiles = listing.files.filter(file => file.toLowerCase().endsWith('.json'));
	if (jsonFiles.length === 0) {
		return {
			state: 'invalid',
			message: `No JSON theme files found in ${normalizedFolder}.`,
			folder: normalizedFolder,
			loadableThemes: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}

	const loadableThemes: string[] = [];
	const invalidFiles: string[] = [];
	for (const file of jsonFiles) {
		try {
			const parsed = JSON.parse(await adapter.read(file)) as unknown;
			const name = getLoadableThemeName(parsed, file);
			if (name) {
				loadableThemes.push(name);
			} else {
				invalidFiles.push(file);
			}
		} catch {
			invalidFiles.push(file);
		}
	}

	if (loadableThemes.length === 0) {
		return {
			state: 'invalid',
			message: `No loadable theme files found in ${normalizedFolder}.`,
			folder: normalizedFolder,
			loadableThemes,
			invalidFiles,
			jsonFileCount: jsonFiles.length,
		};
	}

	return {
		state: 'valid',
		message: `${loadableThemes.length} loadable custom theme${loadableThemes.length === 1 ? '' : 's'} found: ${loadableThemes.join(', ')}`,
		folder: normalizedFolder,
		loadableThemes,
		invalidFiles,
		jsonFileCount: jsonFiles.length,
	};
}

function getThemeLabel(themeId: string): string {
	return THEME_LABELS.get(themeId) ?? themeId;
}

function getLoadableThemeName(parsed: unknown, file: string): string | undefined {
	if (!isThemeLikeObject(parsed)) {
		return undefined;
	}

	const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : filenameWithoutExtension(file);
	return name || undefined;
}

function isThemeLikeObject(parsed: unknown): parsed is { name?: unknown; colors?: unknown; tokenColors?: unknown; settings?: unknown } {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return false;
	}
	const candidate = parsed as { colors?: unknown; tokenColors?: unknown; settings?: unknown };
	return isPlainObject(candidate.colors) || Array.isArray(candidate.tokenColors) || Array.isArray(candidate.settings);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function filenameWithoutExtension(file: string): string {
	const filename = file.split('/').pop() ?? file;
	return filename.replace(/\.json$/i, '');
}
