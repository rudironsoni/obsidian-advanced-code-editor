import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';

describe('startup bundle', () => {
	test('startup JavaScript stays small enough for fast Obsidian activation', () => {
		const bytes = statSync(new URL('../dist/main.js', import.meta.url)).size;

		expect(bytes).toBeLessThanOrEqual(50 * 1024);
	});

	test('startup JavaScript is a standalone Obsidian plugin entrypoint', () => {
		const startupBundle = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');

		expect(startupBundle).not.toContain('require(`./');
		expect(startupBundle).not.toContain("require('./");
		expect(startupBundle).not.toContain('require("./');
	});

	test('heavy renderer is emitted as an explicit mobile-sync artifact', () => {
		expect(existsSync(new URL('../dist/highlighter.js', import.meta.url))).toBe(true);
	});

	test('release workflow uploads every generated JavaScript sidecar', () => {
		const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

		expect(workflow).toContain('dist/*.js');
		expect(workflow).toContain('dist/*.css');
		expect(workflow).not.toContain('dist/main.js');
	});
});
