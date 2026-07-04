import path from 'node:path';
import { env } from 'node:process';

const cacheDir = path.resolve(env.OBSIDIAN_WDIO_CACHE_DIR ?? 'tests/runtime-session/wdio-cache');
const obsidianOptions = {
	installerVersion: env.OBSIDIAN_WDIO_INSTALLER_VERSION ?? 'latest',
	plugins: ['dist'],
	vault: 'tests/wdio-vault/basic',
	...(env.OBSIDIAN_APP ? { binaryPath: env.OBSIDIAN_APP } : {}),
	...(env.OBSIDIAN_APP_ASAR ? { appPath: env.OBSIDIAN_APP_ASAR } : {}),
};

export const config: WebdriverIO.Config = {
	runner: 'local',
	framework: 'cucumber',
	specs: [
		[
			'./tests/bdd/features/plugin-loads.feature',
			'./tests/bdd/features/rendering.feature',
			'./tests/bdd/features/mobile-emulation.feature',
			'./tests/bdd/features/horizontal-scroll.feature',
		],
	],
	maxInstances: 1,
	capabilities: [
		{
			browserName: 'obsidian',
			browserVersion: env.OBSIDIAN_WDIO_APP_VERSION ?? 'latest',
			'wdio:obsidianOptions': obsidianOptions,
		},
	],
	services: ['obsidian'],
	reporters: ['obsidian'],
	cacheDir,
	cucumberOpts: {
		require: ['./tests/bdd/steps/**/*.ts', './tests/bdd/support/**/*.ts'],
		tags: env.WDIO_CUCUMBER_TAGS ?? '',
		timeout: 120000,
	},
	waitforInterval: 250,
	waitforTimeout: 10000,
	connectionRetryCount: 1,
	connectionRetryTimeout: 30000,
	logLevel: 'warn',
	injectGlobals: false,
};
