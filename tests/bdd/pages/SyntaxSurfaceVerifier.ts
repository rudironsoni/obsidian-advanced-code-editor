import { browser } from '@wdio/globals';
import { executeObsidian } from '../support/executeObsidian.js';

const pluginId = 'advanced-code-block';

export type RenderState = {
	blocks: number;
	codeBlocks: number;
	tokens: number;
	text: string;
	csharpListTokenColors: string[];
	width: number;
	height: number;
	isMobile: boolean;
	debug: string[];
};

export type LivePreviewSyntaxState = {
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

export type SourceModeSyntaxState = {
	rawFenceVisible: boolean;
	pluginTokenCount: number;
	distinctTokenColorCount: number;
	transparentTokenCount: number;
	visibleTokenCount: number;
	text: string;
	activeTheme: string;
	expectedThemeBackground: string;
	rootBackgroundValue: string;
	rootBackgroundColor: string;
	codeLineBackgroundColor: string;
	backgroundMatchesExpected: boolean;
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
		plugins: Record<string, unknown>;
	};
	workspace: {
		activeLeaf?: {
			view?: unknown;
		};
	};
};

class SyntaxSurfaceVerifier {
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
			throw new Error(`Live Preview Shiki token styling did not cover expected source text: ${JSON.stringify(lastState)}`, { cause: error });
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
			const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
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
			const tokens = block?.querySelectorAll('.shiki-reading-token').length ?? 0;
			const csharpListTokenColors = block
				? [...block.querySelectorAll<HTMLElement>('.shiki-reading-token')]
						.filter(token => token.textContent === 'List')
						.map(token => getComputedStyle(token).color.trim())
				: [];
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
				csharpListTokenColors,
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
					if (parent?.closest<HTMLElement>('.shiki-live-preview-token')) {
						text += node.textContent ?? '';
					}
					node = walker.nextNode();
				}
				return text;
			};
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview') ??
				document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview');
			const lines = [...(root?.querySelectorAll<HTMLElement>('.cm-line.shiki-live-preview-code-line') ?? [])];
			const rect = root?.getBoundingClientRect();
			const tokenElements = [...(root?.querySelectorAll<HTMLElement>('.cm-line.shiki-live-preview-code-line .shiki-live-preview-token') ?? [])].filter(
				element => Boolean(element.textContent?.trim()),
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
		return executeObsidian(async ({ app }, id): Promise<SourceModeSyntaxState> => {
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6:not(.is-live-preview)') ??
				document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6:not(.is-live-preview)');
			const scope = root?.querySelector<HTMLElement>('.cm-content') ?? root ?? document.body;
			const codeLine = scope.querySelector<HTMLElement>('.cm-line.HyperMD-codeblock');
			const tokenElements = [...scope.querySelectorAll<HTMLElement>('.cm-line.HyperMD-codeblock .shiki-source-token')].filter(element =>
				Boolean(element.textContent?.trim()),
			);
			const plugin = runtimeApp.plugins.plugins[id] as
				| {
						getActiveTheme?(): string;
						highlighter?: {
							getHighlightTokens?(code: string, language: string): Promise<unknown>;
							getThemeBackground?(highlight: unknown): string | undefined;
						};
				  }
				| undefined;
			const activeTheme = plugin?.getActiveTheme?.() ?? '';
			const highlight = await plugin?.highlighter?.getHighlightTokens?.('public sealed class Solution {}', 'cs');
			const expectedThemeBackground = plugin?.highlighter?.getThemeBackground?.(highlight) ?? '';
			const normalizeColor = (value: string | undefined): string => {
				if (!value) return '';
				const probe = document.createElement('span');
				probe.style.color = value;
				document.body.appendChild(probe);
				const normalized = getComputedStyle(probe).color;
				probe.remove();
				return normalized;
			};
			const rootBackgroundValue = root?.style.getPropertyValue('--shiki-code-background').trim() ?? '';
			const rootBackgroundColor = normalizeColor(rootBackgroundValue);
			const codeLineBackgroundColor = codeLine ? getComputedStyle(codeLine).backgroundColor.trim() : '';
			const expectedBackgroundColor = normalizeColor(expectedThemeBackground);
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
				activeTheme,
				expectedThemeBackground,
				rootBackgroundValue,
				rootBackgroundColor,
				codeLineBackgroundColor,
				backgroundMatchesExpected:
					expectedBackgroundColor !== '' && rootBackgroundColor === expectedBackgroundColor && codeLineBackgroundColor === expectedBackgroundColor,
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
		}, pluginId);
	}
}

function compactSyntaxText(text: string): string {
	return text.replace(/\s+/g, '');
}

export const syntaxSurfaceVerifier = new SyntaxSurfaceVerifier();
