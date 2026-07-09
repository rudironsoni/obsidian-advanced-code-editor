import { describe, expect, test } from 'bun:test';
import { validateCustomLanguageFolder, validateDisabledLanguages, type LanguageFolderAdapter } from 'packages/obsidian/src/settings/LanguageValidation';

function createAdapter(files: Record<string, string>): LanguageFolderAdapter {
	return {
		async exists(path: string): Promise<boolean> {
			return path === 'customLanguages' || Object.hasOwn(files, path);
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

describe('language validation helpers', () => {
	test('reports empty disabled languages as neutral', () => {
		const validation = validateDisabledLanguages([]);

		expect(validation.state).toBe('empty');
		expect(validation.normalizedLanguages).toEqual([]);
		expect(validation.message).toContain('No languages are excluded');
	});

	test('validates disabled language rules against static language metadata and matrix coverage', () => {
		const validation = validateDisabledLanguages(['cs', 'not-a-language', 'CS', 'ts']);

		expect(validation.state).toBe('warning');
		expect(validation.normalizedLanguages).toEqual(['cs', 'not-a-language', 'ts']);
		expect(validation.unknownLanguages).toEqual(['not-a-language']);
		expect(validation.duplicateLanguages).toEqual(['cs']);
		expect(validation.matrixLanguages).toEqual(['cs', 'ts']);
		expect(validation.message).toContain('unsupported');
		expect(validation.message).toContain('duplicate');
		expect(validation.message).toContain('matrix-covered');
	});

	test('accepts known disabled languages outside the matrix', () => {
		const validation = validateDisabledLanguages(['ruby']);

		expect(validation.state).toBe('valid');
		expect(validation.unknownLanguages).toEqual([]);
		expect(validation.duplicateLanguages).toEqual([]);
		expect(validation.matrixLanguages).toEqual([]);
	});

	test('reports an empty custom language folder setting as neutral', async () => {
		const validation = await validateCustomLanguageFolder(createAdapter({}), '');

		expect(validation.state).toBe('empty');
		expect(validation.loadableLanguages).toEqual([]);
		expect(validation.message).toContain('No custom language folder configured');
	});

	test('reports missing custom language folders', async () => {
		const validation = await validateCustomLanguageFolder(createAdapter({}), 'missingLanguages');

		expect(validation.state).toBe('missing');
		expect(validation.folder).toBe('missingLanguages');
		expect(validation.loadableLanguages).toEqual([]);
	});

	test('reports folders without loadable language JSON files as invalid', async () => {
		const validation = await validateCustomLanguageFolder(
			createAdapter({
				'customLanguages/readme.txt': 'not a language',
				'customLanguages/broken.json': '{',
				'customLanguages/plain.json': '{"name":"Plain"}',
			}),
			'customLanguages',
		);

		expect(validation.state).toBe('invalid');
		expect(validation.jsonFileCount).toBe(2);
		expect(validation.loadableLanguages).toEqual([]);
		expect(validation.invalidFiles).toEqual(['customLanguages/broken.json', 'customLanguages/plain.json']);
	});

	test('counts TextMate grammar JSON files as loadable custom languages', async () => {
		const validation = await validateCustomLanguageFolder(
			createAdapter({
				'customLanguages/odin.json': JSON.stringify({
					name: 'Odin',
					scopeName: 'source.odin',
					patterns: [{ match: '.*', name: 'source.odin' }],
				}),
			}),
			'customLanguages',
		);

		expect(validation.state).toBe('valid');
		expect(validation.jsonFileCount).toBe(1);
		expect(validation.loadableLanguages).toEqual(['Odin']);
		expect(validation.message).toContain('1 loadable custom language found');
	});
});
