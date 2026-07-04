import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';

type PluginManifest = {
	id: string;
	name: string;
	version: string;
	description: string;
	minAppVersion: string;
	isDesktopOnly: boolean;
};

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

describe('startup bundle', () => {
	test('startup JavaScript stays small enough for fast Obsidian activation', () => {
		const bytes = statSync(new URL('../dist/main.js', import.meta.url)).size;

		// Keep the mobile-safe single-file build on Shiki's smaller web bundle, not the full grammar bundle.
		expect(bytes).toBeLessThanOrEqual(6 * 1024 * 1024);
	});

	test('startup JavaScript is the real Obsidian plugin entrypoint', () => {
		const startupBundle = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');

		expect(startupBundle).toMatch(/extends [a-zA-Z_$][\w$]*\.Plugin/);
		expect(startupBundle).toContain('exports.default=');
		expect(startupBundle).not.toContain('exports.default=require');
		expect(startupBundle).not.toContain('exports.default=e.default');
	});

	test('startup bundle uses Shiki without Monaco', () => {
		const startupBundle = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');
		const manifest = readFileSync(new URL('../dist/manifest.json', import.meta.url), 'utf8');

		expect(startupBundle).toContain('createHighlighter');
		expect(startupBundle).not.toContain('monaco.editor.create');
		expect(startupBundle).not.toContain('modern-monaco');
		expect(manifest).not.toContain('shikiModernMonacoFallback');
	});

	test('plugin identity metadata matches the Advanced Code Block migration plan', () => {
		const packageJson = readJson<{ name: string; version: string }>('../package.json');
		const manifest = readJson<PluginManifest>('../manifest.json');
		const betaManifest = readJson<PluginManifest>('../manifest-beta.json');
		const versions = readJson<Record<string, string>>('../versions.json');

		expect(packageJson.name).toBe('advanced-code-block');
		expect(packageJson.version).toBe('0.9.0');
		expect(manifest.id).toBe(packageJson.name);
		expect(manifest.name).toBe('Advanced Code Block');
		expect(manifest.version).toBe(packageJson.version);
		expect(betaManifest.id).toBe(manifest.id);
		expect(betaManifest.name).toBe(manifest.name);
		expect(betaManifest.version).toBe(manifest.version);
		expect(versions[manifest.version]).toBe(manifest.minAppVersion);
	});

	test('Shiki code block CSS owns horizontal scroll inside blocks', () => {
		const styles = readFileSync(new URL('../dist/styles.css', import.meta.url), 'utf8');

		expect(styles).toContain('.shiki-reading-block');
		expect(styles).toContain('.shiki-live-preview-block');
		expect(styles).toContain('overflow-x:auto');
	});

	test('release workflow uploads every generated JavaScript sidecar', () => {
		const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

		expect(workflow).toContain('PLUGIN_NAME: advanced-code-block');
		expect(workflow).toContain('dist/*.js');
		expect(workflow).toContain('dist/*.css');
		expect(workflow).not.toContain('dist/main.js');
	});

	test('release workflow marks every SemVer prerelease tag as prerelease', () => {
		const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

		expect(workflow).toContain('github.ref_name');
		expect(workflow).toContain('== *-*');
	});

	test('beta workflow publishes typed branches with computed SemVer tags', () => {
		const workflow = readFileSync(new URL('../.github/workflows/beta-release.yml', import.meta.url), 'utf8');

		expect(workflow).toContain('PLUGIN_NAME: advanced-code-block');
		expect(workflow).toContain("'feature/**'");
		expect(workflow).toContain("'feature-*'");
		expect(workflow).toContain("'fix/**'");
		expect(workflow).toContain("'bug/**'");
		expect(workflow).toContain("'chore/**'");
		expect(workflow).toContain("'deps/**'");
		expect(workflow).toContain('git fetch --tags --force');
		expect(workflow).toContain('require("./package.json")');
		expect(workflow).toContain('baseVersion');
		expect(workflow).toContain('git tag --list');
		expect(workflow).toContain('-beta\\.(\\d+)');
		expect(workflow).toContain('beta.${latest ? latest.beta + 1 : 1}');
		expect(workflow).toContain('Apply beta version to plugin manifests');
		expect(workflow).toContain('BETA_VERSION: ${{ steps.beta-version.outputs.new_tag }}');
		expect(workflow).not.toContain('git push origin HEAD:${{ github.ref_name }}');
		expect(workflow).not.toContain('git add package.json manifest.json manifest-beta.json versions.json');
		expect(workflow).toContain('tag_name: ${{ steps.beta-version.outputs.new_tag }}');
		expect(workflow).toContain('prerelease: true');
		expect(workflow).toContain('target_commitish: ${{ github.ref_name }}');
		expect(workflow).toContain('dist/*.js');
		expect(workflow).toContain('dist/*.css');
	});
});
