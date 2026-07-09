import { Decoration, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { type Range } from '@codemirror/state';
import { buildCm6ShikiTokenDecorations } from 'packages/obsidian/src/codemirror/Cm6_ShikiTokenDecorations';
import { getCm6SourceViewRoot, resolveCm6SourcePath } from 'packages/obsidian/src/codemirror/Cm6_ViewContext';
import { CodeBlockParser } from 'packages/obsidian/src/codeblocks/CodeBlockParser';
import type { CodeBlockLineInfo, CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';
import { SHIKI_LIVE_PREVIEW_TOKEN_CLASS } from 'packages/obsidian/src/ShikiHighlighter';

const LIVE_PREVIEW_ADAPTER_OWNER = '__shikiLivePreviewAdapterOwner';

type LivePreviewOwnerElement = HTMLElement & { [LIVE_PREVIEW_ADAPTER_OWNER]?: LivePreviewAdapter };
export class LivePreviewAdapter {
	private static readonly HIDDEN_GUTTER_CLASS = 'shiki-gutter-line-hidden';
	decorations: DecorationSet = Decoration.none;
	private structuralDecorations: DecorationSet = Decoration.none;
	private editTokenDecorations: DecorationSet = Decoration.none;
	private readonly plugin: ShikiPlugin;
	private readonly requestDecorationRefresh: () => void;
	private readonly parser = new CodeBlockParser();
	private readonly modeClassObserver: MutationObserver;
	private readonly view: EditorView;
	private blocks: CodeBlockModel[] = [];
	private destroyed = false;
	private livePreviewActive = false;
	private lastRootLivePreviewClass = false;
	private tokenizationRequest = 0;

	private readonly gutterObserver: MutationObserver;

	constructor(plugin: ShikiPlugin, view: EditorView, requestDecorationRefresh: () => void) {
		this.plugin = plugin;
		this.view = view;
		this.requestDecorationRefresh = requestDecorationRefresh;
		const sourceViewRoot = (this.view.dom.closest('.markdown-source-view.mod-cm6') ?? this.view.dom) as LivePreviewOwnerElement;
		this.lastRootLivePreviewClass = sourceViewRoot.classList.contains('is-live-preview');
		this.modeClassObserver = new MutationObserver(this.handleModeClassChange);
		this.modeClassObserver.observe(sourceViewRoot, { attributes: true, attributeFilter: ['class'] });
		this.gutterObserver = new MutationObserver(() => this.syncGutterVisibility());
		const gutterEl = this.view.dom.querySelector('.cm-lineNumbers');
		if (gutterEl) {
			this.gutterObserver.observe(gutterEl, { childList: true, subtree: true });
		}
		if (this.plugin.isCurrentInstance()) {
			sourceViewRoot[LIVE_PREVIEW_ADAPTER_OWNER]?.destroy();
			sourceViewRoot[LIVE_PREVIEW_ADAPTER_OWNER] = this;
		}
	}

	update(update: ViewUpdate, isLivePreview: boolean): void {
		if (this.destroyed || !this.plugin.isCurrentInstance()) {
			this.clearDecorationSets();
			return;
		}

		if (!this.isActuallyLivePreview(isLivePreview)) {
			this.clearLivePreviewState();
			return;
		}

		this.livePreviewActive = true;

		if (!update.docChanged && !update.viewportChanged && !update.focusChanged && !update.geometryChanged) {
			return;
		}

		this.rebuildBlocks({ includeAllBlocks: update.focusChanged || update.geometryChanged });
	}

	private isActuallyLivePreview(isLivePreview: boolean): boolean {
		if (isLivePreview) return true;
		return this.getSourceViewRoot()?.classList.contains('is-live-preview') ?? false;
	}

	async forceRefresh(): Promise<void> {
		if (this.destroyed || !this.plugin.isCurrentInstance()) {
			return;
		}
		this.livePreviewActive = true;
		this.rebuildBlocks({ includeAllBlocks: true });
		this.requestDecorationRefresh();
	}

	refreshForModeChange(): void {
		const isLivePreview = this.getSourceViewRoot().classList.contains('is-live-preview');
		this.lastRootLivePreviewClass = isLivePreview;
		if (!isLivePreview) {
			this.clearLivePreviewState();
			return;
		}
		this.livePreviewActive = true;
		this.rebuildBlocks({ includeAllBlocks: true });
	}

	refreshDomMounts(): void {
		this.syncGutterVisibility();
	}

	destroy(): void {
		this.destroyed = true;
		this.modeClassObserver.disconnect();
		this.gutterObserver.disconnect();
		this.clearLivePreviewState();
	}

	private readonly handleModeClassChange = (): void => {
		const isLivePreview = this.getSourceViewRoot().classList.contains('is-live-preview');
		if (isLivePreview === this.lastRootLivePreviewClass) {
			return;
		}
		this.refreshForModeChange();
	};

	private rebuildBlocks(options: { includeAllBlocks?: boolean } = {}): void {
		const parsed = this.parser.parseLivePreviewBlocks(this.collectLines());
		const sourcePath = resolveCm6SourcePath(this.plugin, this.view);
		this.blocks = parsed.map(block =>
			this.plugin.codeBlockRegistry.createModel({
				sourcePath,
				hostMode: 'live-preview',
				language: block.language,
				meta: block.meta.raw.trim(),
				code: this.view.state.doc.sliceString(block.range.charFrom, block.range.charTo),
				fenceFrom: this.view.state.doc.line(block.openingFenceLine).from,
				fenceTo: this.view.state.doc.line(block.closingFenceLine).to,
				codeFrom: block.range.charFrom,
				codeTo: block.range.charTo,
				sectionStartLine: block.openingFenceLine,
				sectionEndLine: block.closingFenceLine,
				openingFence: block.meta.openingFence,
				openingFenceLine: block.openingFenceLine,
				closingFenceLine: block.closingFenceLine,
			}),
		);

		const tokenBlocks: CodeBlockModel[] = [];
		for (const block of this.blocks) {
			if (block.openingFenceLine === undefined) {
				continue;
			}
			tokenBlocks.push(block);
			this.plugin.codeBlockRegistry.upsert(block);
		}
		this.structuralDecorations = Decoration.none;
		this.refreshDecorationSet();
		window.requestAnimationFrame(() => this.syncGutterVisibility());
		void this.retokenizeBlocks(tokenBlocks, options);
	}

	private async retokenizeBlocks(blocks: CodeBlockModel[], options: { includeAllBlocks?: boolean } = {}): Promise<void> {
		const requestId = ++this.tokenizationRequest;
		const includeAllBlocks = options.includeAllBlocks ?? false;
		const eligibleBlocks = blocks.filter(
			(block): block is CodeBlockModel & { codeFrom: number; codeTo: number } =>
				block.codeFrom !== undefined &&
				block.codeTo !== undefined &&
				!!block.language &&
				!this.plugin.loadedSettings.disabledLanguages.includes(block.language) &&
				(includeAllBlocks || (block.codeTo >= this.view.viewport.from && block.codeFrom <= this.view.viewport.to)),
		);
		if (eligibleBlocks.length === 0) {
			this.editTokenDecorations = Decoration.none;
			this.refreshDecorationSet();
			this.requestDecorationRefresh();
			return;
		}

		const sourceViewRoot = this.getSourceViewRoot();
		sourceViewRoot.style.removeProperty('--shiki-code-background');
		sourceViewRoot.style.removeProperty('--shiki-gutter-background');
		const result = await buildCm6ShikiTokenDecorations({
			plugin: this.plugin,
			blocks: eligibleBlocks,
			tokenClassName: SHIKI_LIVE_PREVIEW_TOKEN_CLASS,
			shouldContinue: () => requestId === this.tokenizationRequest,
		});
		if (!result || requestId !== this.tokenizationRequest) {
			return;
		}
		if (result.themeBackground) {
			sourceViewRoot.style.setProperty('--shiki-code-background', result.themeBackground);
			sourceViewRoot.style.setProperty('--shiki-gutter-background', result.themeBackground);
		}
		this.editTokenDecorations = result.decorations;
		this.refreshDecorationSet();
		this.requestDecorationRefresh();
	}

	private refreshDecorationSet(): void {
		const ranges: Range<Decoration>[] = [];
		for (const set of [this.structuralDecorations, this.editTokenDecorations]) {
			set.between(0, this.view.state.doc.length, (from, to, value) => {
				ranges.push(value.range(from, to));
			});
		}
		this.decorations = ranges.length ? Decoration.set(ranges, true) : Decoration.none;
	}

	public syncGutterVisibility(): void {
		const gutters = Array.from(this.view.dom.querySelectorAll('.cm-lineNumbers .cm-gutterElement'));
		for (const gutter of gutters) {
			gutter.classList.remove(LivePreviewAdapter.HIDDEN_GUTTER_CLASS);
		}
	}

	private collectLines(): CodeBlockLineInfo[] {
		const lines: CodeBlockLineInfo[] = [];
		for (let lineNumber = 1; lineNumber <= this.view.state.doc.lines; lineNumber++) {
			const line = this.view.state.doc.line(lineNumber);
			lines.push({ lineNumber, text: line.text, from: line.from, to: line.to });
		}
		return lines;
	}

	private clearLivePreviewState(): void {
		this.livePreviewActive = false;
		this.clearDecorationSets();
		this.blocks = [];
		window.requestAnimationFrame(() => this.syncGutterVisibility());
	}

	private clearDecorationSets(): void {
		this.tokenizationRequest++;
		this.structuralDecorations = Decoration.none;
		this.editTokenDecorations = Decoration.none;
		this.decorations = Decoration.none;
	}

	private getSourceViewRoot(): HTMLElement {
		return getCm6SourceViewRoot(this.view);
	}
}
