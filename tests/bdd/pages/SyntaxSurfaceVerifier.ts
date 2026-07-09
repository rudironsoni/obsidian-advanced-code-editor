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

export type LivePreviewFenceCursorState = {
	opening: LivePreviewFenceCursorProbe;
	closing: LivePreviewFenceCursorProbe;
	isMobile: boolean;
};

export type LivePreviewFenceCursorProbe = {
	lineText: string;
	fenceText: string;
	activeLineText: string;
	fenceLineHasFenceClass: boolean;
	caretColor: string;
	fenceCaretColor: string;
	cursorBorderColor: string;
	hasReplacementWidget: boolean;
	cursor: { line: number; ch: number };
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

export type ThemeBackgroundMode = 'reading' | 'live-preview' | 'source';

export type ThemeBackgroundState = {
	mode: ThemeBackgroundMode;
	activeTheme: string;
	expectedThemeBackground: string;
	expectedBackgroundColor: string;
	rootBackgroundValue: string;
	rootBackgroundColor: string;
	codeBackgroundColor: string;
	gutterBackgroundColor: string;
	gutterBeforeBackgroundColor: string;
	gutterAfterBackgroundColor: string;
	backgroundMatchesExpected: boolean;
	gutterBackgroundMatchesExpected: boolean;
	visibleTargetCount: number;
	isMobile: boolean;
};

export type MetadataParityMode = 'reading' | 'live-preview';

export type MetadataParityBlockState = {
	title: string;
	language: string;
	lineNumberTexts: string[];
	highlightedLineTexts: string[];
	insertedLineTexts: string[];
	deletedLineTexts: string[];
	wrapClassPresent: boolean;
	nowrapClassPresent: boolean;
};

export type MetadataParityState = {
	mode: MetadataParityMode;
	isMobile: boolean;
	blocks: MetadataParityBlockState[];
};

export type CopyControlMode = 'reading' | 'live-preview';

export type CopyControlState = {
	mode: CopyControlMode;
	isMobile: boolean;
	blockText: string;
	successWrite: string;
	errorWrite: string;
	initialText: string;
	copiedText: string;
	errorText: string;
	initialState: string;
	copiedState: string;
	errorState: string;
	initialAriaLabel: string;
	copiedAriaLabel: string;
	errorAriaLabel: string;
	initialWidth: number;
	copiedWidth: number;
	errorWidth: number;
	initialHeight: number;
	copiedHeight: number;
	errorHeight: number;
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

	async getLivePreviewFenceCursorState(): Promise<LivePreviewFenceCursorState> {
		return executeObsidian(async ({ app }): Promise<LivePreviewFenceCursorState> => {
			type RuntimeEditor = {
				getValue(): string;
				getLine(line: number): string;
				setCursor(cursor: { line: number; ch: number }): void;
				scrollIntoView?(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean): void;
				focus?(): void;
			};
			const runtimeApp = app as unknown as RuntimeApp;
			const view = runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement; editor?: RuntimeEditor };
			const editor = view?.editor;
			if (!editor) {
				throw new Error('Active markdown editor was not available');
			}
			const lines = editor.getValue().split('\n');
			const openingLine = lines.findIndex(line => line.trim().startsWith('```'));
			const closingLine = lines.findIndex((line, index) => index > openingLine && line.trim().startsWith('```'));
			if (openingLine < 0 || closingLine < 0) {
				throw new Error(`Live Preview fenced block was not found: ${JSON.stringify(lines)}`);
			}

			const probeFenceLine = async (lineIndex: number, fenceLineClass: string): Promise<LivePreviewFenceCursorProbe> => {
				const lineText = editor.getLine(lineIndex);
				const cursor = { line: lineIndex, ch: Math.min(1, lineText.length) };
				editor.setCursor(cursor);
				editor.scrollIntoView?.({ from: cursor, to: { line: lineIndex, ch: lineText.length } }, true);
				editor.focus?.();
				await new Promise(resolve => window.setTimeout(resolve, 100));

				const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
				const root =
					active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview') ??
					document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview');
				const activeLine = root?.querySelector<HTMLElement>('.cm-line.cm-activeLine');
				const fenceLine =
					root?.querySelector<HTMLElement>(`.cm-line.shiki-live-preview-fence-line.${fenceLineClass}`) ??
					[...(root?.querySelectorAll<HTMLElement>('.cm-line.shiki-live-preview-fence-line') ?? [])].find(element =>
						(element.textContent ?? '').includes(lineText.trim()),
					);
				const fenceText = fenceLine?.querySelector<HTMLElement>('.shiki-live-preview-fence-text');
				const cursorElement = root?.querySelector<HTMLElement>('.cm-cursor-primary, .cm-cursor');
				const lineStyle = fenceLine ? getComputedStyle(fenceLine) : undefined;
				const fenceStyle = fenceText ? getComputedStyle(fenceText) : undefined;
				const cursorStyle = cursorElement ? getComputedStyle(cursorElement) : undefined;

				return {
					lineText,
					fenceText: fenceText?.textContent ?? '',
					activeLineText: activeLine?.textContent ?? '',
					fenceLineHasFenceClass: fenceLine?.classList.contains('shiki-live-preview-fence-line') ?? false,
					caretColor: lineStyle?.caretColor.trim() ?? '',
					fenceCaretColor: fenceStyle?.caretColor.trim() ?? '',
					cursorBorderColor: cursorStyle?.borderLeftColor.trim() ?? cursorStyle?.borderColor.trim() ?? '',
					hasReplacementWidget: fenceLine?.querySelector('.cm-widgetBuffer') !== null,
					cursor,
				};
			};

			return {
				opening: await probeFenceLine(openingLine, 'shiki-live-preview-opening-fence-line'),
				closing: await probeFenceLine(closingLine, 'shiki-live-preview-closing-fence-line'),
				isMobile: runtimeApp.isMobile,
			};
		});
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

	async verifyCopyControl(mode: CopyControlMode): Promise<CopyControlState> {
		await browser.waitUntil(async () => this.hasCopyControl(mode), {
			timeout: 30000,
			timeoutMsg: `Copy control did not mount in ${mode}`,
		});
		return this.getCopyControlState(mode);
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

	async waitForThemeBackground(mode: ThemeBackgroundMode): Promise<ThemeBackgroundState> {
		let lastState: ThemeBackgroundState | undefined;
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.getThemeBackgroundState(mode);
					lastState = state;
					return state.visibleTargetCount > 0 && state.backgroundMatchesExpected;
				},
				{ timeout: 30000, timeoutMsg: `${mode} background did not match the selected Shiki theme` },
			);
		} catch (error) {
			throw new Error(`${mode} background did not match the selected Shiki theme: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.getThemeBackgroundState(mode);
	}

	async getThemeBackgroundState(mode: ThemeBackgroundMode): Promise<ThemeBackgroundState> {
		return executeObsidian(
			async ({ app }, id, selectedMode): Promise<ThemeBackgroundState> => {
				const runtimeApp = app as unknown as RuntimeApp;
				const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
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
				const root =
					selectedMode === 'reading'
						? (active?.querySelector<HTMLElement>('.shiki-reading-block') ??
							document.querySelector<HTMLElement>('.markdown-preview-view .shiki-reading-block'))
						: selectedMode === 'live-preview'
							? (active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview') ??
								document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview'))
							: (active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6:not(.is-live-preview)') ??
								document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6:not(.is-live-preview)'));
				const target =
					selectedMode === 'reading'
						? root
						: selectedMode === 'live-preview'
							? root?.querySelector<HTMLElement>('.cm-line.shiki-live-preview-code-line')
							: root?.querySelector<HTMLElement>('.cm-line.HyperMD-codeblock');
				const targetRect = target?.getBoundingClientRect();
				const gutter =
					selectedMode === 'reading'
						? root?.querySelector<HTMLElement>('.shiki-line-numbers')
						: selectedMode === 'live-preview'
							? root?.querySelector<HTMLElement>('.shiki-live-preview-line-number')
							: null;
				const gutterStyle = gutter ? getComputedStyle(gutter) : null;
				const gutterBeforeStyle = gutter ? getComputedStyle(gutter, '::before') : null;
				const gutterAfterStyle = gutter ? getComputedStyle(gutter, '::after') : null;
				const expectedBackgroundColor = normalizeColor(expectedThemeBackground);
				const rootBackgroundValue = root?.style.getPropertyValue('--shiki-code-background').trim() ?? '';
				const rootBackgroundColor = normalizeColor(rootBackgroundValue);
				const codeBackgroundColor = target ? getComputedStyle(target).backgroundColor.trim() : '';
				const gutterBackgroundColor = gutterStyle?.backgroundColor.trim() ?? '';
				const gutterBeforeBackgroundColor = gutterBeforeStyle?.backgroundColor.trim() ?? '';
				const gutterAfterBackgroundColor = gutterAfterStyle?.backgroundColor.trim() ?? '';

				return {
					mode: selectedMode,
					activeTheme,
					expectedThemeBackground,
					expectedBackgroundColor,
					rootBackgroundValue,
					rootBackgroundColor,
					codeBackgroundColor,
					gutterBackgroundColor,
					gutterBeforeBackgroundColor,
					gutterAfterBackgroundColor,
					backgroundMatchesExpected:
						expectedBackgroundColor !== '' && rootBackgroundColor === expectedBackgroundColor && codeBackgroundColor === expectedBackgroundColor,
					gutterBackgroundMatchesExpected:
						selectedMode === 'source' ||
						(expectedBackgroundColor !== '' &&
							gutterBackgroundColor === expectedBackgroundColor &&
							(selectedMode !== 'live-preview' ||
								(gutterBeforeBackgroundColor === expectedBackgroundColor && gutterAfterBackgroundColor === expectedBackgroundColor))),
					visibleTargetCount:
						target && targetRect && targetRect.width > 0 && targetRect.height > 0 && codeBackgroundColor !== 'rgba(0, 0, 0, 0)' ? 1 : 0,
					isMobile: runtimeApp.isMobile,
				};
			},
			pluginId,
			mode,
		);
	}

	async waitForMetadataParity(mode: MetadataParityMode): Promise<MetadataParityState> {
		let lastState: MetadataParityState | undefined;
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.getMetadataParityState(mode);
					lastState = state;
					const parityBlock = state.blocks.find(block => block.title === 'Parity metadata block');
					const diffBlock = state.blocks.find(block => block.title === 'Diff metadata block');
					return (
						parityBlock !== undefined &&
						diffBlock !== undefined &&
						parityBlock.lineNumberTexts.join(',') === '1,2,3,4' &&
						parityBlock.highlightedLineTexts.some(text => text.includes('highlighted')) &&
						parityBlock.insertedLineTexts.some(text => text.includes('inserted')) &&
						parityBlock.deletedLineTexts.some(text => text.includes('deleted')) &&
						diffBlock.lineNumberTexts.join(',') === '1,2,3' &&
						diffBlock.insertedLineTexts.some(text => text.includes('added line')) &&
						diffBlock.deletedLineTexts.some(text => text.includes('removed line'))
					);
				},
				{ timeout: 30000, timeoutMsg: `${mode} metadata parity did not render` },
			);
		} catch (error) {
			throw new Error(`${mode} metadata parity did not render: ${JSON.stringify(lastState)}`, { cause: error });
		}
		return this.getMetadataParityState(mode);
	}

	async getMetadataParityState(mode: MetadataParityMode): Promise<MetadataParityState> {
		return executeObsidian(({ app }, selectedMode): MetadataParityState => {
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				selectedMode === 'reading'
					? (active?.querySelector<HTMLElement>('.markdown-preview-view') ?? document.querySelector<HTMLElement>('.markdown-preview-view'))
					: (active?.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview') ??
						document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6.is-live-preview'));
			const blockIds =
				selectedMode === 'reading'
					? [...(root?.querySelectorAll<HTMLElement>('.shiki-reading-block[data-shiki-block-id]') ?? [])].map(
							block => block.dataset.shikiBlockId ?? '',
						)
					: [...(root?.querySelectorAll<HTMLElement>('.shiki-live-preview-header[data-shiki-block-id]') ?? [])].map(
							header => header.dataset.shikiBlockId ?? '',
						);

			const blocks = blockIds.filter(Boolean).map((blockId): MetadataParityBlockState => {
				const blockRoot =
					selectedMode === 'reading'
						? root?.querySelector<HTMLElement>(`.shiki-reading-block[data-shiki-block-id="${blockId}"]`)
						: root?.querySelector<HTMLElement>(`.shiki-live-preview-header[data-shiki-block-id="${blockId}"]`);
				const lineRoot = selectedMode === 'reading' ? blockRoot : root;
				const lineSelector =
					selectedMode === 'reading' ? '.shiki-code-line' : `.cm-line.shiki-live-preview-code-line[data-shiki-block-id="${blockId}"]`;
				const lineNumberSelector =
					selectedMode === 'reading' ? '.shiki-line-numbers span' : `.shiki-live-preview-line-number[data-shiki-block-id="${blockId}"]`;
				const lines = [...(lineRoot?.querySelectorAll<HTMLElement>(lineSelector) ?? [])];
				const lineTexts = (className: string): string[] => lines.filter(line => line.classList.contains(className)).map(line => line.textContent ?? '');

				return {
					title: blockRoot?.querySelector<HTMLElement>('.shiki-block-title')?.textContent ?? '',
					language: blockRoot?.querySelector<HTMLElement>('.shiki-lang-name')?.textContent ?? '',
					lineNumberTexts: [...(lineRoot?.querySelectorAll<HTMLElement>(lineNumberSelector) ?? [])].map(line => line.textContent ?? ''),
					highlightedLineTexts: lineTexts('shiki-line-highlight'),
					insertedLineTexts: lineTexts('shiki-line-inserted'),
					deletedLineTexts: lineTexts('shiki-line-deleted'),
					wrapClassPresent:
						selectedMode === 'reading'
							? (blockRoot?.classList.contains('wrap-lines') ?? false)
							: lines.some(line => line.classList.contains('shiki-live-preview-code-line-wrap')),
					nowrapClassPresent:
						selectedMode === 'reading'
							? !(blockRoot?.classList.contains('wrap-lines') ?? false)
							: lines.some(line => line.classList.contains('shiki-live-preview-code-line-nowrap')),
				};
			});

			return {
				mode: selectedMode,
				isMobile: runtimeApp.isMobile,
				blocks,
			};
		}, mode);
	}

	private async getCopyControlState(mode: CopyControlMode): Promise<CopyControlState> {
		return executeObsidian(async ({ app }, selectedMode): Promise<CopyControlState> => {
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				active?.querySelector<HTMLElement>(selectedMode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view.mod-cm6.is-live-preview') ??
				document.querySelector<HTMLElement>(selectedMode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view.mod-cm6.is-live-preview');
			const block =
				selectedMode === 'reading'
					? root?.querySelector<HTMLElement>('.shiki-reading-block')
					: root?.querySelector<HTMLElement>('.shiki-live-preview-header');
			const button = block?.querySelector<HTMLButtonElement>('.shiki-copy-button');
			if (!root || !block || !button) {
				throw new Error(`Copy control was not mounted in ${selectedMode}`);
			}

			const settle = async (): Promise<void> => {
				await Promise.resolve();
				await new Promise<void>(resolve => window.setTimeout(resolve, 0));
			};
			const dimensions = (): { width: number; height: number } => {
				const rect = button.getBoundingClientRect();
				return { width: rect.width, height: rect.height };
			};
			const snapshot = (): { text: string; state: string; ariaLabel: string; width: number; height: number } => {
				const rect = dimensions();
				return {
					text: button.textContent ?? '',
					state: button.dataset.shikiCopyState ?? '',
					ariaLabel: button.getAttribute('aria-label') ?? '',
					width: rect.width,
					height: rect.height,
				};
			};

			const clipboard = navigator.clipboard as Clipboard & { writeText: Clipboard['writeText'] };
			const ownWriteTextDescriptor = Object.getOwnPropertyDescriptor(clipboard, 'writeText');
			const writes: string[] = [];
			let rejectNextWrite = false;
			const writeText = (text: string): Promise<void> => {
				writes.push(text);
				if (rejectNextWrite) {
					rejectNextWrite = false;
					return Promise.reject(new Error('Forced clipboard failure'));
				}
				return Promise.resolve();
			};
			Object.defineProperty(clipboard, 'writeText', {
				configurable: true,
				value: writeText,
			});

			try {
				const initial = snapshot();
				button.click();
				await settle();
				const copied = snapshot();
				rejectNextWrite = true;
				button.click();
				await settle();
				const errored = snapshot();

				return {
					mode: selectedMode,
					isMobile: runtimeApp.isMobile,
					blockText: block.textContent ?? '',
					successWrite: writes[0] ?? '',
					errorWrite: writes[1] ?? '',
					initialText: initial.text,
					copiedText: copied.text,
					errorText: errored.text,
					initialState: initial.state,
					copiedState: copied.state,
					errorState: errored.state,
					initialAriaLabel: initial.ariaLabel,
					copiedAriaLabel: copied.ariaLabel,
					errorAriaLabel: errored.ariaLabel,
					initialWidth: initial.width,
					copiedWidth: copied.width,
					errorWidth: errored.width,
					initialHeight: initial.height,
					copiedHeight: copied.height,
					errorHeight: errored.height,
				};
			} finally {
				if (ownWriteTextDescriptor) {
					Object.defineProperty(clipboard, 'writeText', ownWriteTextDescriptor);
				} else {
					const mutableClipboard = clipboard as unknown as { writeText?: Clipboard['writeText'] };
					delete mutableClipboard.writeText;
				}
			}
		}, mode);
	}

	private async hasCopyControl(mode: CopyControlMode): Promise<boolean> {
		return executeObsidian(({ app }, selectedMode): boolean => {
			const runtimeApp = app as unknown as RuntimeApp;
			const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root =
				active?.querySelector<HTMLElement>(selectedMode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view.mod-cm6.is-live-preview') ??
				document.querySelector<HTMLElement>(selectedMode === 'reading' ? '.markdown-preview-view' : '.markdown-source-view.mod-cm6.is-live-preview');
			return root?.querySelector('.shiki-copy-button') !== null;
		}, mode);
	}
}

function compactSyntaxText(text: string): string {
	return text.replace(/\s+/g, '');
}

export const syntaxSurfaceVerifier = new SyntaxSurfaceVerifier();
