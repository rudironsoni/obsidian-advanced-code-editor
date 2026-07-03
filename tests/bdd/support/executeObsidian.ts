import { browser } from '@wdio/globals';
import type * as Obsidian from 'obsidian';

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
	await browser.waitUntil(
		async () =>
			browser.execute(() => {
				const runtimeWindow = window as unknown as { wdioObsidianService?: unknown };
				return typeof runtimeWindow.wdioObsidianService === 'function';
			}),
		{ timeout: 30000, interval: 100, timeoutMsg: 'WDIO Obsidian service helper was not available' },
	);
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
