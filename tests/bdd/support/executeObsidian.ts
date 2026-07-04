import { browser } from '@wdio/globals';
import type * as Obsidian from 'obsidian';
import { isWebDriverSessionGoneError } from './wdioSession.js';

type ExecuteObsidianArg = {
	app: Obsidian.App;
	obsidian: typeof Obsidian;
	plugins: Record<string, unknown>;
	require: NodeJS.Require;
};

type BrowserWithExecuteObsidian = typeof browser & {
	executeObsidian<Return, Params extends unknown[]>(
		func: (obsidian: ExecuteObsidianArg, ...params: Params) => Return,
		...params: Params
	): Promise<Awaited<Return>>;
};

export async function waitForObsidianServiceHelper(): Promise<void> {
	const deadline = Date.now() + 30000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			if (await isObsidianServiceHelperAvailable({ failOnGoneSession: true })) {
				return;
			}
		} catch (error) {
			if (isWebDriverSessionGoneError(error)) {
				throw error;
			}
			lastError = error;
		}
		await browser.pause(100);
	}
	throw new Error('WDIO Obsidian service helper was not available', { cause: lastError });
}

export async function isObsidianServiceHelperAvailable(options: { failOnGoneSession?: boolean } = {}): Promise<boolean> {
	try {
		return await browser.execute(() => {
			const runtimeWindow = window as unknown as { wdioObsidianService?: unknown };
			return typeof runtimeWindow.wdioObsidianService === 'function';
		});
	} catch (error) {
		if (isWebDriverSessionGoneError(error)) {
			if (options.failOnGoneSession) {
				throw error;
			}
			return false;
		}
		throw error;
	}
}

export async function executeObsidian<Return, Params extends unknown[]>(
	func: (obsidian: ExecuteObsidianArg, ...params: Params) => Return,
	...params: Params
): Promise<Awaited<Return>> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 5; attempt++) {
		await waitForObsidianServiceHelper();
		try {
			return await (browser as BrowserWithExecuteObsidian).executeObsidian(func, ...params);
		} catch (error) {
			lastError = error;
			if (!isMissingHelperError(error)) {
				throw error;
			}
			await browser.pause(250);
		}
	}
	throw lastError;
}

function isMissingHelperError(error: unknown): boolean {
	const message = String(error instanceof Error ? error.message : error);
	return message.includes('wdioObsidianService') && message.includes('not a function');
}
