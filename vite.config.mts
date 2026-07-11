import path from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig, type UserConfig } from 'vite';
import type { Plugin } from 'vite';
import { bundledLanguagesInfo } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';
import { compress, init as initZstd } from '@bokuweb/zstd-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import banner from 'vite-plugin-banner';
import { getBuildBanner } from '@lemons_dev/lemons-obsidian-plugin-automation';
import manifest from './manifest.json' with { type: 'json' };
import { BUNDLED_THEMES_INFO } from './packages/obsidian/src/settings/BundledThemeInfo';

const externalNodeBuiltins = builtinModules;

const entryFile = 'packages/obsidian/src/main.ts';

function getBuildEntryFile(): string {
	return entryFile;
}

const SHIKI_ASSETS_MODULE = 'virtual:compressed-shiki-assets';
const RESOLVED_SHIKI_ASSETS_MODULE = `\0${SHIKI_ASSETS_MODULE}`;

async function compressRegistry(value: unknown): Promise<string> {
	await initZstd();
	return Buffer.from(compress(Buffer.from(JSON.stringify(value)), 19)).toString('base64');
}

function compressedShikiAssets(): Plugin {
	return {
		name: 'compressed-shiki-assets',
		resolveId(id) {
			return id === SHIKI_ASSETS_MODULE ? RESOLVED_SHIKI_ASSETS_MODULE : undefined;
		},
		async load(id) {
			if (id !== RESOLVED_SHIKI_ASSETS_MODULE) return undefined;
			const languageEntries = await Promise.all(bundledLanguagesInfo.map(async language => [language.id, (await language.import()).default] as const));
			const themeEntries = await Promise.all(BUNDLED_THEMES_INFO.map(async theme => [theme.id, (await bundledThemes[theme.id]()).default] as const));
			if (new Set(languageEntries.map(([id]) => id)).size !== bundledLanguagesInfo.length) {
				throw new Error('Compressed Shiki registry contains duplicate canonical languages');
			}
			if (new Set(themeEntries.map(([id]) => id)).size !== BUNDLED_THEMES_INFO.length) {
				throw new Error('Compressed Shiki registry contains duplicate selectable themes');
			}
			const registry = { languages: Object.fromEntries(languageEntries), themes: Object.fromEntries(themeEntries) };
			const payload = await compressRegistry(registry);
			return `export const compressedShikiAssets = ${JSON.stringify(payload)};`;
		},
	};
}

export default defineConfig(({ mode }) => {
	const prod = mode === 'production';
	const outDir = prod ? 'dist/' : `exampleVault/.obsidian/plugins/${manifest.id}/`;
	const buildEntry = 'main';

	const external = [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...externalNodeBuiltins,
	];

	return {
		plugins: [
			compressedShikiAssets(),
			banner({
				outDir,
				content: getBuildBanner(prod ? 'Release Build' : 'Dev Build', version => version),
			}),
			...(true
				? [
						viteStaticCopy({
							targets: [{ src: 'manifest.json', dest: '' }],
						}),
					]
				: []),
		],
		resolve: {
			alias: {
				packages: path.resolve(__dirname, './packages'),
			},
		},
		build: {
			lib: {
				entry: path.resolve(__dirname, getBuildEntryFile()),
				name: 'main',
				fileName: () => `${buildEntry}.js`,
				formats: ['cjs'],
			},
			minify: prod,
			target: 'es2022',
			sourcemap: prod ? false : 'inline',
			cssCodeSplit: false,
			emptyOutDir: false,
			outDir,
			rolldownOptions: {
				checks: {
					pluginTimings: false,
				},
				output: {
					dir: outDir,
					entryFileNames: 'main.js',
					assetFileNames: 'styles.css',
					codeSplitting: false,
					exports: 'named',
				},
				external,
			},
		},
	} as UserConfig;
});
