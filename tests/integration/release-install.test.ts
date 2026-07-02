import { afterEach, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = new URL('../..', import.meta.url);
const distDir = new URL('dist/', repoRoot);
const rootManifestPath = new URL('manifest.json', repoRoot);
const requiredReleaseArtifacts = ['main.js', 'manifest.json', 'styles.css'] as const;

let tempVault: string | undefined;

function readJson<T>(path: URL | string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('release artifact install layout', () => {
	afterEach(() => {
		if (tempVault) {
			rmSync(tempVault, { recursive: true, force: true });
			tempVault = undefined;
		}
	});

	test('installs the built plugin payload into an isolated vault', () => {
		const rootManifest = readJson<{ id: string; version: string; minAppVersion: string; isDesktopOnly: boolean }>(rootManifestPath);
		tempVault = mkdtempSync(join(tmpdir(), 'obsidian-shiki-install-'));
		const pluginDir = join(tempVault, '.obsidian', 'plugins', rootManifest.id);
		mkdirSync(pluginDir, { recursive: true });

		for (const artifact of requiredReleaseArtifacts) {
			const source = new URL(artifact, distDir);
			expect(existsSync(source), `${artifact} should exist in dist after bun run build`).toBe(true);
			expect(statSync(source).isFile(), `${artifact} should be a file`).toBe(true);
			copyFileSync(source, join(pluginDir, artifact));
		}

		writeFileSync(join(tempVault, '.obsidian', 'community-plugins.json'), JSON.stringify([rootManifest.id], null, '\t'));
		writeFileSync(join(tempVault, '.obsidian', 'app.json'), JSON.stringify({ safeMode: false }, null, '\t'));

		const installedManifest = readJson<{ id: string; version: string; minAppVersion: string; isDesktopOnly: boolean }>(join(pluginDir, 'manifest.json'));
		const installedCommunityPlugins = readJson<string[]>(join(tempVault, '.obsidian', 'community-plugins.json'));

		expect(installedManifest.id).toBe(rootManifest.id);
		expect(installedManifest.version).toBe(rootManifest.version);
		expect(installedManifest.minAppVersion).toBe(rootManifest.minAppVersion);
		expect(installedManifest.isDesktopOnly).toBe(false);
		expect(installedCommunityPlugins).toEqual([rootManifest.id]);
	});
});
