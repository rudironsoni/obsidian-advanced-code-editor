import { browser } from '@wdio/globals';
import { executeObsidian, waitForObsidianServiceHelper } from '../support/executeObsidian.js';
import { isWebDriverSessionGoneError } from '../support/wdioSession.js';

const pluginId = 'advanced-code-block';
const phonePortraitClass = 'shiki-wdio-phone-portrait';
const phonePortraitStyleId = 'shiki-wdio-phone-portrait-style';
let phonePortraitStyleApplied = false;

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

type LivePreviewSyntaxState = {
	lines: number;
	tokens: number;
	text: string;
	styledText: string;
	distinctTokenColorCount: number;
	transparentTokenCount: number;
	visibleTokenCount: number;
	width: number;
	height: number;
	isMobile: boolean;
};

type SourceModeSyntaxState = {
	rawFenceVisible: boolean;
	pluginTokenCount: number;
	distinctTokenColorCount: number;
	transparentTokenCount: number;
	visibleTokenCount: number;
	text: string;
	monacoEditorCount: number;
	renderedBlockChromeCount: number;
	internalLineNumberCount: number;
	blockScrollRowCount: number;
	blockScrollbarCount: number;
	isMobile: boolean;
};

type RuntimeApp = {
	isMobile: boolean;
	plugins: {
		enabledPlugins: Set<string>;
		manifests: Record<string, { version?: string } | undefined>;
		plugins: Record<string, unknown>;
	};
	workspace: {
		leftSplit?: {
			collapse(): void;
			expand(): void;
		};
		trigger?(name: string): void;
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

	async openFixtureInLivePreview(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'source', source: false }, active: true }, { history: false });
		}, path);
	}

	async openFixtureInSourceMode(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'source', source: true }, active: true }, { history: false });
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

	async waitForLivePreviewStyledSource(expectedText: string): Promise<LivePreviewSyntaxState> {
		let lastState: LivePreviewSyntaxState | undefined;
		const compactExpectedText = compactSyntaxText(expectedText);
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.getLivePreviewSyntaxState();
					lastState = state;
					return (
						state.lines >= 1 &&
						state.tokens > 0 &&
						state.text.includes(expectedText) &&
						compactSyntaxText(state.styledText).includes(compactExpectedText) &&
						state.distinctTokenColorCount >= 3 &&
						state.visibleTokenCount >= 5 &&
						state.transparentTokenCount === 0
					);
				},
				{ timeout: 30000, timeoutMsg: 'Live Preview Shiki token styling did not cover the expected source text' },
			);
		} catch (error) {
			throw new Error(`Live Preview Shiki token styling did not cover the expected source text: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.getLivePreviewSyntaxState();
	}

	async waitForSourceModeShiki(expectedText: string): Promise<SourceModeSyntaxState> {
		let lastState: SourceModeSyntaxState | undefined;
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.getSourceModeSyntaxState();
					lastState = state;
					return (
						state.rawFenceVisible &&
						state.text.includes(expectedText) &&
						state.pluginTokenCount > 0 &&
						state.distinctTokenColorCount >= 3 &&
						state.visibleTokenCount >= 5 &&
						state.transparentTokenCount === 0 &&
						state.monacoEditorCount === 0 &&
						state.renderedBlockChromeCount === 0 &&
						state.internalLineNumberCount === 0 &&
						state.blockScrollRowCount === 0 &&
						state.blockScrollbarCount === 0
					);
				},
				{ timeout: 30000, timeoutMsg: 'Source Mode Shiki token styling did not cover the expected source text' },
			);
		} catch (error) {
			throw new Error(`Source Mode Shiki token styling did not cover expected source text: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.getSourceModeSyntaxState();
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

	async getLivePreviewSyntaxState(): Promise<LivePreviewSyntaxState> {
		return executeObsidian(({ app }): LivePreviewSyntaxState => {
			const collectStyledText = (target: HTMLElement): string => {
				const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
				let text = '';
				let node = walker.nextNode();
				while (node) {
					const parent = node.parentElement;
					if (parent?.closest<HTMLElement>('[style*="color"]')) {
						text += node.textContent ?? '';
					}
					node = walker.nextNode();
				}
				return text;
			};
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (app.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview') ??
				document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview');
			const lines = [...(root?.querySelectorAll<HTMLElement>('.cm-line.shiki-live-preview-code-line') ?? [])];
			const line = lines.find(candidate => candidate.textContent?.includes('// Define constants')) ?? lines[0];
			const rect = root?.getBoundingClientRect();
			const tokenElements = [...(root?.querySelectorAll<HTMLElement>('.cm-line.shiki-live-preview-code-line [style*="color"]') ?? [])].filter(element =>
				Boolean(element.textContent?.trim()),
			);
			const tokenColors = new Set<string>();
			let transparentTokenCount = 0;
			let visibleTokenCount = 0;
			for (const token of tokenElements) {
				const style = getComputedStyle(token);
				const color = style.color.trim();
				const textFillColor = style.getPropertyValue('-webkit-text-fill-color').trim();
				const tokenRect = token.getBoundingClientRect();
				const transparent = color === 'rgba(0, 0, 0, 0)' || textFillColor === 'rgba(0, 0, 0, 0)';
				if (color) tokenColors.add(color);
				if (transparent) transparentTokenCount++;
				if (style.display !== 'none' && style.visibility !== 'hidden' && tokenRect.width > 0 && tokenRect.height > 0 && !transparent) {
					visibleTokenCount++;
				}
			}
			const styledText = root ? collectStyledText(root) : '';

			return {
				lines: lines.length,
				tokens: tokenElements.length,
				text: root?.textContent ?? '',
				styledText,
				distinctTokenColorCount: tokenColors.size,
				transparentTokenCount,
				visibleTokenCount,
				width: rect?.width ?? 0,
				height: rect?.height ?? 0,
				isMobile: runtimeApp.isMobile,
			};
		});
	}

	async getSourceModeSyntaxState(): Promise<SourceModeSyntaxState> {
		return executeObsidian(({ app }): SourceModeSyntaxState => {
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (app.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6:not(.is-live-preview)') ??
				document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6:not(.is-live-preview)');
			const scope = root?.querySelector<HTMLElement>('.cm-content') ?? root ?? document.body;
			const tokenElements = [...scope.querySelectorAll<HTMLElement>('.cm-line.HyperMD-codeblock .shiki-source-token')].filter(element =>
				Boolean(element.textContent?.trim()),
			);
			const tokenColors = new Set<string>();
			let transparentTokenCount = 0;
			let visibleTokenCount = 0;
			for (const token of tokenElements) {
				const style = getComputedStyle(token);
				const color = style.color.trim();
				const textFillColor = style.getPropertyValue('-webkit-text-fill-color').trim();
				const rect = token.getBoundingClientRect();
				const transparent = color === 'rgba(0, 0, 0, 0)' || textFillColor === 'rgba(0, 0, 0, 0)';
				if (color) tokenColors.add(color);
				if (transparent) transparentTokenCount++;
				if (style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && !transparent) {
					visibleTokenCount++;
				}
			}
			return {
				rawFenceVisible: (scope.textContent ?? '').includes('```'),
				pluginTokenCount: tokenElements.length,
				distinctTokenColorCount: tokenColors.size,
				transparentTokenCount,
				visibleTokenCount,
				text: scope.textContent ?? '',
				monacoEditorCount: scope.querySelectorAll('.monaco-editor').length,
				renderedBlockChromeCount: scope.querySelectorAll(
					[
						'.shiki-live-preview-header',
						'.shiki-block-header',
						'.shiki-copy-button',
						'.shiki-live-preview-fence-text',
						'.shiki-live-preview-code-content',
						'.shiki-live-preview-block',
						'.shiki-reading-block',
						'.shiki-line-numbers',
					].join(', '),
				).length,
				internalLineNumberCount: scope.querySelectorAll('.shiki-live-preview-line-number, .shiki-line-numbers span').length,
				blockScrollRowCount: scope.querySelectorAll('.shiki-block-scroll-row[data-shiki-block-id], .shiki-source-code-line').length,
				blockScrollbarCount: scope.querySelectorAll('.shiki-block-horizontal-scrollbar').length,
				isMobile: runtimeApp.isMobile,
			};
		});
	}

	async collapseAndExpandLeftSidebar(): Promise<void> {
		await executeObsidian(({ app }) => {
			const runtimeApp = app as unknown as RuntimeApp;
			runtimeApp.workspace.leftSplit?.collapse();
			runtimeApp.workspace.trigger?.('layout-change');
		});
		await browser.pause(250);
		await executeObsidian(({ app }) => {
			const runtimeApp = app as unknown as RuntimeApp;
			runtimeApp.workspace.leftSplit?.expand();
			runtimeApp.workspace.trigger?.('layout-change');
		});
		await browser.pause(500);
	}

	async expectMobileEmulation(): Promise<void> {
		await browser.waitUntil(async () => this.isMobileEmulationActive(), {
			timeout: 30000,
			timeoutMsg: 'Obsidian mobile emulation was not active. Run mobile scenarios with wdio.mobile.conf.mts.',
		});
		await waitForObsidianServiceHelper();
	}

	async resizeToPhonePortrait(): Promise<void> {
		await executeObsidian(
			(_, input) => {
				document.body.classList.add(input.className);
				document.getElementById(input.styleId)?.remove();
				const style = document.createElement('style');
				style.id = input.styleId;
				style.textContent = `
				body.${input.className} .workspace-leaf.mod-active .view-content {
					width: 430px !important;
					max-width: 430px !important;
					margin-inline: auto !important;
				}
				body.${input.className} .workspace-leaf.mod-active .markdown-source-view,
				body.${input.className} .workspace-leaf.mod-active .markdown-preview-view {
					width: 100% !important;
					max-width: 100% !important;
				}
			`;
				document.head.appendChild(style);
			},
			{ className: phonePortraitClass, styleId: phonePortraitStyleId },
		);
		phonePortraitStyleApplied = true;
	}

	async resetWindowSize(): Promise<void> {
		if (!phonePortraitStyleApplied) {
			return;
		}
		phonePortraitStyleApplied = false;
		await executeObsidian(
			(_, input) => {
				document.body.classList.remove(input.className);
				document.getElementById(input.styleId)?.remove();
			},
			{ className: phonePortraitClass, styleId: phonePortraitStyleId },
		);
	}

	async resetMobileEmulation(): Promise<void> {
		if (!(await this.canReadMobileEmulationState())) {
			return;
		}
	}

	private async isMobileEmulationActive(): Promise<boolean> {
		return browser.execute(() => {
			const runtimeWindow = window as unknown as { app?: { isMobile?: boolean } };
			return runtimeWindow.app?.isMobile === true;
		});
	}

	private async canReadMobileEmulationState(): Promise<boolean> {
		try {
			await this.isMobileEmulationActive();
			return true;
		} catch (error) {
			if (isWebDriverSessionGoneError(error)) {
				return false;
			}
			throw error;
		}
	}
}

function compactSyntaxText(text: string): string {
	return text.replace(/\s+/g, '');
}

export const obsidianApp = new ObsidianAppPage();
