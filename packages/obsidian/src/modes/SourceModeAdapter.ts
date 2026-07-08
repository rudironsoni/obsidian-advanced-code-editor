import { Decoration, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { buildCm6ShikiTokenDecorations } from 'packages/obsidian/src/codemirror/Cm6_ShikiTokenDecorations';
import { getCm6SourceViewRoot, resolveCm6SourcePath } from 'packages/obsidian/src/codemirror/Cm6_ViewContext';
import { CodeBlockParser } from 'packages/obsidian/src/codeblocks/CodeBlockParser';
import type { CodeBlockLineInfo, CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';
import { SHIKI_SOURCE_TOKEN_CLASS } from 'packages/obsidian/src/ShikiHighlighter';

export class SourceModeAdapter {
	decorations: DecorationSet = Decoration.none;
	private readonly parser = new CodeBlockParser();
	private tokenizationRequest = 0;

	constructor(
		private readonly plugin: ShikiPlugin,
		private readonly view: EditorView,
		private readonly requestDecorationRefresh: () => void,
	) {}

	update(update: ViewUpdate, isLivePreview: boolean): void {
		if (!this.plugin.isCurrentInstance()) {
			this.clearDecorations();
			return;
		}
		this.decorations = this.decorations.map(update.changes);
		if (isLivePreview) {
			this.clearDecorations();
			return;
		}
		if (update.docChanged || update.viewportChanged || update.focusChanged) {
			void this.retokenize();
		}
	}

	async retokenize(): Promise<void> {
		if (!this.plugin.isCurrentInstance()) {
			this.clearDecorations();
			return;
		}

		const requestId = ++this.tokenizationRequest;
		const parsed = this.parser.parseLivePreviewBlocks(this.collectLines());
		const visibleBlocks = parsed
			.map(block => this.toSourceBlock(block))
			.filter((block): block is CodeBlockModel & { codeFrom: number; codeTo: number } => block.codeFrom !== undefined && block.codeTo !== undefined)
			.filter(block => block.codeTo >= this.view.viewport.from && block.codeFrom <= this.view.viewport.to)
			.filter(block => block.language && !this.plugin.loadedSettings.disabledLanguages.includes(block.language));

		const result = await buildCm6ShikiTokenDecorations({
			plugin: this.plugin,
			blocks: visibleBlocks,
			tokenClassName: SHIKI_SOURCE_TOKEN_CLASS,
			shouldContinue: () => requestId === this.tokenizationRequest,
		});
		if (!result || requestId !== this.tokenizationRequest) {
			return;
		}
		this.decorations = result.decorations;
		this.applySourceModeBackground(result.themeBackground);
		this.requestDecorationRefresh();
	}

	destroy(): void {
		this.tokenizationRequest++;
		this.decorations = Decoration.none;
		this.clearSourceModeBackground();
	}

	private clearDecorations(): void {
		this.tokenizationRequest++;
		this.decorations = Decoration.none;
	}

	private clearSourceModeBackground(): void {
		this.applySourceModeBackground(undefined);
	}

	private applySourceModeBackground(themeBackground: string | undefined): void {
		const sourceViewRoot = getCm6SourceViewRoot(this.view);
		if (sourceViewRoot.classList.contains('is-live-preview')) {
			return;
		}
		if (themeBackground) {
			sourceViewRoot.style.setProperty('--shiki-code-background', themeBackground);
			return;
		}
		sourceViewRoot.style.removeProperty('--shiki-code-background');
	}

	private collectLines(): CodeBlockLineInfo[] {
		const lines: CodeBlockLineInfo[] = [];
		for (let lineNumber = 1; lineNumber <= this.view.state.doc.lines; lineNumber++) {
			const line = this.view.state.doc.line(lineNumber);
			lines.push({ lineNumber, text: line.text, from: line.from, to: line.to });
		}
		return lines;
	}

	private toSourceBlock(parsed: ReturnType<CodeBlockParser['parseLivePreviewBlocks']>[number]): CodeBlockModel {
		return this.plugin.codeBlockRegistry.createModel({
			sourcePath: resolveCm6SourcePath(this.plugin, this.view),
			hostMode: 'source',
			language: parsed.language,
			meta: parsed.meta.raw.trim(),
			code: this.view.state.doc.sliceString(parsed.range.charFrom, parsed.range.charTo),
			fenceFrom: this.view.state.doc.line(parsed.openingFenceLine).from,
			fenceTo: this.view.state.doc.line(parsed.closingFenceLine).to,
			codeFrom: parsed.range.charFrom,
			codeTo: parsed.range.charTo,
			sectionStartLine: parsed.openingFenceLine,
			sectionEndLine: parsed.closingFenceLine,
			openingFence: parsed.meta.openingFence,
			openingFenceLine: parsed.openingFenceLine,
			closingFenceLine: parsed.closingFenceLine,
		});
	}
}
