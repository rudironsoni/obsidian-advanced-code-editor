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

type SyntaxMatrixMode = 'reading' | 'live-preview' | 'source';

type SyntaxMatrixNeedleState = {
	needle: string;
	found: boolean;
	color: string;
	visible: boolean;
	transparent: boolean;
};

type SyntaxMatrixProbeState = {
	language: string;
	lineText: string;
	linePresent: boolean;
	pluginTokenCount: number;
	distinctTokenColorCount: number;
	transparentTokenCount: number;
	visibleTokenCount: number;
	needles: SyntaxMatrixNeedleState[];
};

type SyntaxMatrixState = {
	mode: SyntaxMatrixMode;
	text: string;
	isMobile: boolean;
	probes: SyntaxMatrixProbeState[];
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

const syntaxLanguageMatrix = [
	{ language: 'cs', lineText: 'List<int[]> mergedIntervals = new();', needles: ['List', 'int', 'mergedIntervals', 'new'] },
	{ language: 'ts', lineText: 'type User = { id: number; name: string };', needles: ['type', 'User', 'number', 'string'] },
	{ language: 'js', lineText: 'const result = items.map(item => item.id);', needles: ['const', 'result', 'map', 'item', 'id'] },
	{ language: 'py', lineText: 'def merge(values: list[int]) -> list[int]:', needles: ['def', 'merge', 'list', 'int'] },
	{ language: 'rs', lineText: 'fn merge(values: Vec<i32>) -> Vec<i32> {', needles: ['fn', 'merge', 'Vec', 'i32'] },
	{ language: 'go', lineText: 'func Merge(values []int) []int {', needles: ['func', 'Merge', 'int'] },
	{ language: 'json', lineText: '"enabled": true,', needles: ['enabled', 'true'] },
	{ language: 'yml', lineText: 'enabled: true', needles: ['enabled', 'true'] },
	{ language: 'bash', lineText: 'for file in *.md; do echo "$file"; done', needles: ['for', 'file', 'in', 'echo'] },
	{ language: 'html', lineText: '<section class="note"><h1>Title</h1></section>', needles: ['section', 'class', 'note', 'h1'] },
	{ language: 'css', lineText: '.note { color: rebeccapurple; display: grid; }', needles: ['note', 'color', 'rebeccapurple', 'display', 'grid'] },
] as const;

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

	async waitForSyntaxLanguageMatrix(mode: SyntaxMatrixMode): Promise<SyntaxMatrixState> {
		let lastState: SyntaxMatrixState | undefined;
		const passes = (probe: SyntaxMatrixProbeState): boolean =>
			probe.linePresent &&
			probe.pluginTokenCount >= probe.needles.length &&
			probe.distinctTokenColorCount >= 2 &&
			probe.visibleTokenCount >= probe.needles.length &&
			probe.transparentTokenCount === 0 &&
			probe.needles.every(needle => needle.found && needle.visible && !needle.transparent);

		if (mode !== 'reading') {
			const probes: SyntaxMatrixProbeState[] = [];
			for (const expected of syntaxLanguageMatrix) {
				await this.revealSyntaxLanguageLine(expected.lineText);
				let matched: SyntaxMatrixProbeState | undefined;
				try {
					await browser.waitUntil(
						async () => {
							const state = await this.getSyntaxLanguageMatrixState(mode);
							lastState = state;
							matched = state.probes.find(probe => probe.language === expected.language);
							return matched !== undefined && passes(matched);
						},
						{ timeout: 45000, timeoutMsg: `Syntax language matrix did not render ${expected.language} Shiki-owned tokens in ${mode}` },
					);
				} catch (error) {
					throw new Error(`Syntax language matrix did not render ${expected.language} Shiki-owned tokens in ${mode}: ${JSON.stringify(lastState)}`, {
						cause: error,
					});
				}
				probes.push(matched!);
			}
			const finalState = await this.getSyntaxLanguageMatrixState(mode);
			return { ...finalState, probes };
		}

		try {
			await browser.waitUntil(
				async () => {
					const state = await this.getSyntaxLanguageMatrixState(mode);
					lastState = state;
					return state.probes.every(passes);
				},
				{ timeout: 45000, timeoutMsg: `Syntax language matrix did not render Shiki-owned tokens in ${mode}` },
			);
		} catch (error) {
			throw new Error(`Syntax language matrix did not render Shiki-owned tokens in ${mode}: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.getSyntaxLanguageMatrixState(mode);
	}

	async revealSyntaxLanguageLine(lineText: string): Promise<void> {
		await executeObsidian(({ app }, expectedLine) => {
			type RuntimeEditor = {
				getValue(): string;
				getLine(line: number): string;
				setCursor(cursor: { line: number; ch: number }): void;
				scrollIntoView?(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean): void;
				focus?(): void;
			};
			const editor = (app.workspace.activeLeaf?.view as unknown as { editor?: RuntimeEditor })?.editor;
			if (!editor) {
				return;
			}
			const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();
			const expected = normalizeText(expectedLine);
			const lines = editor.getValue().split('\n');
			const lineIndex = lines.findIndex(line => normalizeText(line).includes(expected));
			if (lineIndex < 0) {
				return;
			}
			const line = editor.getLine(lineIndex);
			const cursor = { line: lineIndex, ch: 0 };
			editor.setCursor(cursor);
			editor.scrollIntoView?.({ from: cursor, to: { line: lineIndex, ch: line.length } }, true);
			editor.focus?.();
		}, lineText);
		await browser.pause(250);
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
			const tokens = block?.querySelectorAll('.shiki-reading-token').length ?? 0;
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
					if (parent?.closest<HTMLElement>('.shiki-live-preview-token')) {
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
			const active = (app.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
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
					expectedBackgroundColor !== '' &&
					rootBackgroundColor === expectedBackgroundColor &&
					codeLineBackgroundColor === expectedBackgroundColor,
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

	async getSyntaxLanguageMatrixState(mode: SyntaxMatrixMode): Promise<SyntaxMatrixState> {
		return executeObsidian(
			async ({ app }, input): Promise<SyntaxMatrixState> => {
				const runtimeApp = app as unknown as RuntimeApp;
				const active = (app.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
				const visible = (element: HTMLElement): boolean => {
					const style = getComputedStyle(element);
					const rect = element.getBoundingClientRect();
					const color = style.color.trim();
					const textFillColor = style.getPropertyValue('-webkit-text-fill-color').trim();
					return (
						style.display !== 'none' &&
						style.visibility !== 'hidden' &&
						rect.width > 0 &&
						rect.height > 0 &&
						color !== 'rgba(0, 0, 0, 0)' &&
						textFillColor !== 'rgba(0, 0, 0, 0)'
					);
				};
				const tokenState = (
					tokens: HTMLElement[],
					needles: readonly string[],
				): Omit<SyntaxMatrixProbeState, 'language' | 'lineText' | 'linePresent'> => {
					const tokenColors = new Set<string>();
					let transparentTokenCount = 0;
					let visibleTokenCount = 0;
					for (const token of tokens) {
						const style = getComputedStyle(token);
						const color = style.color.trim();
						const textFillColor = style.getPropertyValue('-webkit-text-fill-color').trim();
						const transparent = color === 'rgba(0, 0, 0, 0)' || textFillColor === 'rgba(0, 0, 0, 0)';
						if (color) tokenColors.add(color);
						if (transparent) transparentTokenCount++;
						if (visible(token)) visibleTokenCount++;
					}
					return {
						pluginTokenCount: tokens.length,
						distinctTokenColorCount: tokenColors.size,
						transparentTokenCount,
						visibleTokenCount,
						needles: needles.map(needle => {
							const token = tokens.find(candidate => (candidate.textContent ?? '').includes(needle));
							if (!token) {
								return { needle, found: false, color: '', visible: false, transparent: false };
							}
							const style = getComputedStyle(token);
							const color = style.color.trim();
							const textFillColor = style.getPropertyValue('-webkit-text-fill-color').trim();
							const transparent = color === 'rgba(0, 0, 0, 0)' || textFillColor === 'rgba(0, 0, 0, 0)';
							return { needle, found: true, color, visible: visible(token), transparent };
						}),
					};
				};
				const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();
				const root =
					active?.querySelector<HTMLElement>(
						input.mode === 'reading'
							? '.markdown-preview-view'
							: input.mode === 'live-preview'
								? '.markdown-source-view.mod-cm6.is-live-preview'
								: '.markdown-source-view.mod-cm6:not(.is-live-preview)',
					) ??
					document.querySelector<HTMLElement>(
						input.mode === 'reading'
							? '.markdown-preview-view'
							: input.mode === 'live-preview'
								? '.markdown-source-view.mod-cm6.is-live-preview'
								: '.markdown-source-view.mod-cm6:not(.is-live-preview)',
					);
				const scope = root ?? document.body;
				const probes = input.matrix.map((probe): SyntaxMatrixProbeState => {
					if (input.mode === 'reading') {
						const blocks = [...scope.querySelectorAll<HTMLElement>('.shiki-reading-block')];
						const block = blocks.find(candidate => (candidate.textContent ?? '').includes(probe.lineText));
						const tokens = [...(block?.querySelectorAll<HTMLElement>('.shiki-reading-token') ?? [])].filter(token =>
							Boolean(token.textContent?.trim()),
						);
						return {
							language: probe.language,
							lineText: probe.lineText,
							linePresent: Boolean(block),
							...tokenState(tokens, probe.needles),
						};
					}

					const lineSelector =
						input.mode === 'live-preview' ? '.cm-line.shiki-live-preview-code-line' : '.cm-line.HyperMD-codeblock, .HyperMD-codeblock';
					const tokenSelector = input.mode === 'live-preview' ? '.shiki-live-preview-token' : '.shiki-source-token';
					const lines = [...scope.querySelectorAll<HTMLElement>(lineSelector)];
					const line = lines.find(candidate => normalizeText(candidate.textContent ?? '').includes(normalizeText(probe.lineText)));
					const tokens = [...(line?.querySelectorAll<HTMLElement>(tokenSelector) ?? [])].filter(token => Boolean(token.textContent?.trim()));
					return {
						language: probe.language,
						lineText: probe.lineText,
						linePresent: Boolean(line),
						...tokenState(tokens, probe.needles),
					};
				});

				return {
					mode: input.mode,
					text: scope.textContent ?? '',
					isMobile: runtimeApp.isMobile,
					probes,
				};
			},
			{ mode, matrix: syntaxLanguageMatrix },
		);
	}

	async moveFocusAwayFromNote(): Promise<void> {
		await executeObsidian(() => {
			const root = document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6, .markdown-preview-view');
			let target = document.getElementById('shiki-wdio-focus-away') as HTMLButtonElement | null;
			if (!target) {
				target = document.createElement('button');
				target.id = 'shiki-wdio-focus-away';
				target.textContent = 'focus';
				target.style.position = 'fixed';
				target.style.left = '0';
				target.style.bottom = '0';
				target.style.width = '1px';
				target.style.height = '1px';
				target.style.opacity = '0';
				document.body.appendChild(target);
			}
			target.focus();
			target.click();
			if (root?.contains(document.activeElement)) {
				throw new Error('Failed to move focus away from the note');
			}
		});
		await browser.pause(500);
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
