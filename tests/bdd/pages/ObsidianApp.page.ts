import { browser } from '@wdio/globals';
import { executeObsidian, waitForObsidianServiceHelper } from '../support/executeObsidian.js';

const pluginId = 'advanced-code-block';

type PluginLoadState = {
	loaded: boolean;
	isMobile: boolean;
	version: string | null;
};

type RenderState = {
	blocks: number;
	codeBlocks: number;
	tokens: number;
	text: string;
	width: number;
	height: number;
	isMobile: boolean;
	debug: string[];
};

type RuntimeApp = {
	isMobile: boolean;
	plugins: {
		enabledPlugins: Set<string>;
		manifests: Record<string, { version?: string } | undefined>;
		plugins: Record<string, unknown>;
	};
};

class ObsidianAppPage {
	async waitForPluginLoaded(): Promise<PluginLoadState> {
		await browser.waitUntil(async () => (await this.getPluginLoadState()).loaded, {
			timeoutMsg: `${pluginId} did not load`,
		});

		return this.getPluginLoadState();
	}

	async getPluginLoadState(): Promise<PluginLoadState> {
		return executeObsidian(({ app }, id): PluginLoadState => {
			const runtimeApp = app as unknown as RuntimeApp;
			const manifest = runtimeApp.plugins.manifests[id];
			return {
				loaded: runtimeApp.plugins.enabledPlugins.has(id) && runtimeApp.plugins.plugins[id] !== undefined,
				isMobile: runtimeApp.isMobile,
				version: manifest?.version ?? null,
			};
		}, pluginId);
	}

	async openFixtureInReadingMode(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'preview' }, active: true }, { history: false });
		}, path);
	}

	async waitForReadingRender(expectedText: string): Promise<RenderState> {
		let lastState: RenderState | undefined;
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.getReadingRenderState();
					lastState = state;
					return state.blocks >= 1 && state.tokens > 0 && state.text.includes(expectedText) && state.width > 80 && state.height > 20;
				},
				{ timeout: 30000, timeoutMsg: 'Shiki reading-mode block did not render visibly' },
			);
		} catch (error) {
			throw new Error(`Shiki reading-mode block did not render visibly: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.getReadingRenderState();
	}

	async getReadingRenderState(): Promise<RenderState> {
		return executeObsidian(({ app }): RenderState => {
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (app.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const candidates = [
				...(active?.querySelectorAll<HTMLElement>('.shiki-reading-block') ?? []),
				...document.querySelectorAll<HTMLElement>('.markdown-preview-view .shiki-reading-block'),
			];
			const blocks = [...new Set(candidates)].filter(block => {
				const rect = block.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			});
			const block = blocks[0];
			const rect = block?.getBoundingClientRect();
			const tokens = block?.querySelectorAll('code span').length ?? 0;
			const codeBlocks = document.querySelectorAll('.markdown-preview-view pre code').length;
			const debug = [...document.querySelectorAll<HTMLElement>('.markdown-preview-view pre, .markdown-preview-view div, .markdown-preview-view code')]
				.filter(el => el.textContent?.includes('wdioValue'))
				.slice(0, 5)
				.map(el => `${el.tagName.toLowerCase()}.${el.className}`.trim());

			return {
				blocks: blocks.length,
				codeBlocks,
				tokens,
				text: block?.textContent ?? '',
				width: rect?.width ?? 0,
				height: rect?.height ?? 0,
				isMobile: runtimeApp.isMobile,
				debug,
			};
		});
	}

	async expectMobileEmulation(): Promise<void> {
		await this.setMobileEmulation(true);
		await browser.waitUntil(async () => this.isMobileEmulationActive(), {
			timeout: 30000,
			timeoutMsg: 'Obsidian mobile emulation was not active',
		});
		await waitForObsidianServiceHelper();
	}

	async resetMobileEmulation(): Promise<void> {
		await this.setMobileEmulation(false);
		await waitForObsidianServiceHelper();
	}

	private async setMobileEmulation(enabled: boolean): Promise<void> {
		await browser.execute(async shouldEnable => {
			const runtimeWindow = window as unknown as {
				app?: {
					emulateMobile(enabled: boolean): Promise<void> | void;
				};
			};
			await runtimeWindow.app?.emulateMobile(shouldEnable);
		}, enabled);
	}

	private async isMobileEmulationActive(): Promise<boolean> {
		return browser.execute(() => {
			const runtimeWindow = window as unknown as { app?: { isMobile?: boolean } };
			return runtimeWindow.app?.isMobile === true;
		});
	}
}

export const obsidianApp = new ObsidianAppPage();
