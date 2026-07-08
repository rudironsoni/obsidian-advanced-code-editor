import { browser } from '@wdio/globals';
import { executeObsidian } from '../support/executeObsidian.js';

export type SyntaxMatrixMode = 'reading' | 'live-preview' | 'source';

type SyntaxMatrixNeedleState = {
	needle: string;
	found: boolean;
	color: string;
	visible: boolean;
	transparent: boolean;
};

export type SyntaxMatrixProbeState = {
	language: string;
	lineText: string;
	linePresent: boolean;
	pluginTokenCount: number;
	distinctTokenColorCount: number;
	transparentTokenCount: number;
	visibleTokenCount: number;
	needles: SyntaxMatrixNeedleState[];
};

export type SyntaxMatrixState = {
	mode: SyntaxMatrixMode;
	text: string;
	isMobile: boolean;
	probes: SyntaxMatrixProbeState[];
};

type RuntimeApp = {
	isMobile: boolean;
	workspace: {
		activeLeaf?: {
			view?: unknown;
		};
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

export class SyntaxMatrixVerifier {
	async waitForSyntaxLanguageMatrix(mode: SyntaxMatrixMode): Promise<SyntaxMatrixState> {
		let lastState: SyntaxMatrixState | undefined;
		const passes = (probe: SyntaxMatrixProbeState): boolean =>
			probe.linePresent &&
			probe.pluginTokenCount >= probe.needles.length &&
			probe.distinctTokenColorCount >= 2 &&
			probe.visibleTokenCount >= probe.needles.length &&
			probe.transparentTokenCount === 0 &&
			probe.needles.every(needle => needle.found && needle.visible && !needle.transparent);

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

	private async revealSyntaxLanguageLine(lineText: string): Promise<void> {
		await executeObsidian(({ app }, expectedLine) => {
			const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();
			const expected = normalizeText(expectedLine);
			const active = (app.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
			const root = active?.querySelector<HTMLElement>('.markdown-preview-view') ?? document.querySelector<HTMLElement>('.markdown-preview-view');
			const blocks = [...(root?.querySelectorAll<HTMLElement>('.shiki-reading-block') ?? [])];
			const block = blocks.find(candidate => normalizeText(candidate.textContent ?? '').includes(expected));
			if (block) {
				block.scrollIntoView({ block: 'center', inline: 'nearest' });
				root?.dispatchEvent(new Event('scroll', { bubbles: true }));
				return;
			}

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

	private async getSyntaxLanguageMatrixState(mode: SyntaxMatrixMode): Promise<SyntaxMatrixState> {
		return executeObsidian(
			async ({ app }, input): Promise<SyntaxMatrixState> => {
				const runtimeApp = app as unknown as RuntimeApp;
				const active = (runtimeApp.workspace.activeLeaf?.view as unknown as { contentEl?: HTMLElement })?.contentEl;
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
}

export const syntaxMatrixVerifier = new SyntaxMatrixVerifier();
