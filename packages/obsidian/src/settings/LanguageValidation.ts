import { getObsidianSafeLanguageNames, resolveLanguageAliasFromMetadata } from 'packages/obsidian/src/runtime/LanguageMetadata';

export const LANGUAGE_SUPPORT_MATRIX_LANGUAGES = ['cs', 'ts', 'js', 'py', 'rs', 'go', 'json', 'yml', 'bash', 'html', 'css'] as const;

export type DisabledLanguageValidationState = 'empty' | 'valid' | 'warning';

export interface DisabledLanguageValidation {
	state: DisabledLanguageValidationState;
	message: string;
	normalizedLanguages: string[];
	duplicateLanguages: string[];
	unknownLanguages: string[];
	matrixLanguages: string[];
}

export type CustomLanguageFolderValidationState = 'empty' | 'valid' | 'missing' | 'invalid';

export interface CustomLanguageFolderValidation {
	state: CustomLanguageFolderValidationState;
	message: string;
	folder: string;
	loadableLanguages: string[];
	invalidFiles: string[];
	jsonFileCount: number;
}

export interface LanguageFolderAdapter {
	exists(path: string): Promise<boolean>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	read(path: string): Promise<string>;
}

export function validateDisabledLanguages(
	disabledLanguages: readonly string[],
	safeLanguages = getObsidianSafeLanguageNames(),
	matrixLanguages: readonly string[] = LANGUAGE_SUPPORT_MATRIX_LANGUAGES,
): DisabledLanguageValidation {
	const safe = new Set(safeLanguages.map(language => language.trim().toLowerCase()).filter(Boolean));
	const matrixCanonical = new Set(matrixLanguages.map(language => canonicalLanguage(language)).filter(Boolean));
	const seen = new Set<string>();
	const normalizedLanguages: string[] = [];
	const duplicateLanguages: string[] = [];
	const unknownLanguages: string[] = [];
	const matrixDisabled = new Set<string>();

	for (const language of disabledLanguages) {
		const normalized = language.trim().toLowerCase();
		if (!normalized) {
			continue;
		}
		if (seen.has(normalized)) {
			duplicateLanguages.push(normalized);
			continue;
		}
		seen.add(normalized);
		normalizedLanguages.push(normalized);
		if (!safe.has(normalized)) {
			unknownLanguages.push(normalized);
		}
		const canonical = canonicalLanguage(normalized);
		if (canonical && matrixCanonical.has(canonical)) {
			matrixDisabled.add(normalized);
		}
	}

	const warnings: string[] = [];
	if (unknownLanguages.length > 0) {
		warnings.push(`${unknownLanguages.length} unsupported rule${unknownLanguages.length === 1 ? '' : 's'}`);
	}
	if (duplicateLanguages.length > 0) {
		warnings.push(`${duplicateLanguages.length} duplicate rule${duplicateLanguages.length === 1 ? '' : 's'}`);
	}
	if (matrixDisabled.size > 0) {
		warnings.push(`${matrixDisabled.size} matrix-covered language${matrixDisabled.size === 1 ? '' : 's'} disabled`);
	}

	return {
		state: normalizedLanguages.length === 0 ? 'empty' : warnings.length > 0 ? 'warning' : 'valid',
		message:
			normalizedLanguages.length === 0
				? 'No languages are excluded.'
				: warnings.length > 0
					? `Review excluded languages: ${warnings.join(', ')}.`
					: `${normalizedLanguages.length} excluded language${normalizedLanguages.length === 1 ? '' : 's'} configured.`,
		normalizedLanguages,
		duplicateLanguages,
		unknownLanguages,
		matrixLanguages: [...matrixDisabled],
	};
}

export async function validateCustomLanguageFolder(adapter: LanguageFolderAdapter, folder: string): Promise<CustomLanguageFolderValidation> {
	const normalizedFolder = folder.trim();
	if (!normalizedFolder) {
		return {
			state: 'empty',
			message: 'No custom language folder configured.',
			folder: '',
			loadableLanguages: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}

	if (!(await adapter.exists(normalizedFolder))) {
		return {
			state: 'missing',
			message: `Custom language folder not found: ${normalizedFolder}`,
			folder: normalizedFolder,
			loadableLanguages: [],
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
			message: `Unable to read custom language folder: ${normalizedFolder}`,
			folder: normalizedFolder,
			loadableLanguages: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}

	const jsonFiles = listing.files.filter(file => file.toLowerCase().endsWith('.json'));
	if (jsonFiles.length === 0) {
		return {
			state: 'invalid',
			message: `No JSON language files found in ${normalizedFolder}.`,
			folder: normalizedFolder,
			loadableLanguages: [],
			invalidFiles: [],
			jsonFileCount: 0,
		};
	}

	const loadableLanguages: string[] = [];
	const invalidFiles: string[] = [];
	for (const file of jsonFiles) {
		try {
			const parsed = JSON.parse(await adapter.read(file)) as unknown;
			const name = getLoadableLanguageName(parsed, file);
			if (name) {
				loadableLanguages.push(name);
			} else {
				invalidFiles.push(file);
			}
		} catch {
			invalidFiles.push(file);
		}
	}

	if (loadableLanguages.length === 0) {
		return {
			state: 'invalid',
			message: `No loadable language files found in ${normalizedFolder}.`,
			folder: normalizedFolder,
			loadableLanguages,
			invalidFiles,
			jsonFileCount: jsonFiles.length,
		};
	}

	return {
		state: 'valid',
		message: `${loadableLanguages.length} loadable custom language${loadableLanguages.length === 1 ? '' : 's'} found: ${loadableLanguages.join(', ')}`,
		folder: normalizedFolder,
		loadableLanguages,
		invalidFiles,
		jsonFileCount: jsonFiles.length,
	};
}

function canonicalLanguage(language: string): string | undefined {
	return resolveLanguageAliasFromMetadata(language)?.toLowerCase() ?? language.trim().toLowerCase();
}

function getLoadableLanguageName(parsed: unknown, file: string): string | undefined {
	if (!isLanguageLikeObject(parsed)) {
		return undefined;
	}
	if (typeof parsed.name === 'string' && parsed.name.trim()) {
		return parsed.name.trim();
	}
	if (typeof parsed.scopeName === 'string' && parsed.scopeName.trim()) {
		return parsed.scopeName.trim();
	}
	return filenameWithoutExtension(file) || undefined;
}

function isLanguageLikeObject(parsed: unknown): parsed is { name?: unknown; scopeName?: unknown; patterns?: unknown; repository?: unknown } {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return false;
	}
	const candidate = parsed as { scopeName?: unknown; patterns?: unknown; repository?: unknown };
	return typeof candidate.scopeName === 'string' && (Array.isArray(candidate.patterns) || isPlainObject(candidate.repository));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function filenameWithoutExtension(file: string): string {
	const filename = file.split('/').pop() ?? file;
	return filename.replace(/\.json$/i, '');
}
