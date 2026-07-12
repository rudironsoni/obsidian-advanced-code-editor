import { type MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type ShikiPlugin from 'packages/obsidian/src/main';
import { parseCodeBlockMeta } from 'packages/obsidian/src/codeblocks/CodeBlockMeta';

export class CodeBlock extends MarkdownRenderChild {
	plugin: ShikiPlugin;
	source: string;
	language: string;
	ctx: MarkdownPostProcessorContext;
	cachedMetaString: string;
	private blockId: string | undefined;
	private touchTapCandidate: { pointerId: number; startX: number; startY: number; scrollOwner: HTMLElement | null; startScrollLeft: number } | undefined;

	private activateLivePreviewEditor(target: EventTarget | null, event: Event, deferFocus = false): void {
		if (!this.containerEl.closest('.markdown-source-view.mod-cm6.is-live-preview')) {
			return;
		}
		if (!(target instanceof HTMLElement) || target.closest('.shiki-copy-button')) {
			return;
		}
		const codeLine = target.closest<HTMLElement>('.shiki-code-line');
		if (!codeLine || !this.containerEl.contains(codeLine)) {
			return;
		}
		const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
		const activeView = this.plugin.app.workspace.activeLeaf?.view as
			| { containerEl?: HTMLElement; editor?: { setCursor(cursor: { line: number; ch: number }): void; focus(): void } }
			| undefined;
		if (!sectionInfo || !activeView?.editor || (activeView.containerEl && !activeView.containerEl.contains(this.containerEl))) {
			return;
		}
		const lineIndex = [...this.containerEl.querySelectorAll('.shiki-code-line')].indexOf(codeLine);
		event.preventDefault();
		event.stopPropagation();
		const cursor = { line: sectionInfo.lineStart + 1 + Math.max(lineIndex, 0), ch: 0 };
		activeView.editor.setCursor(cursor);
		activeView.editor.focus();
		if (deferFocus) {
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					activeView.editor?.setCursor(cursor);
					activeView.editor?.focus();
				}),
			);
		}
	}

	private readonly handleLivePreviewCodeClick = (event: MouseEvent): void => {
		this.activateLivePreviewEditor(event.target, event);
	};

	private readonly handleLivePreviewPointerDown = (event: PointerEvent): void => {
		if (event.pointerType !== 'touch' || !(event.target instanceof HTMLElement) || !event.target.closest('.shiki-code-line')) {
			this.touchTapCandidate = undefined;
			return;
		}
		const scrollOwner = event.target.closest<HTMLElement>('.shiki-block-body');
		this.touchTapCandidate = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			scrollOwner,
			startScrollLeft: scrollOwner?.scrollLeft ?? 0,
		};
	};

	private readonly handleLivePreviewPointerUp = (event: PointerEvent): void => {
		const candidate = this.touchTapCandidate;
		this.touchTapCandidate = undefined;
		if (!candidate) {
			return;
		}
		if (
			candidate.pointerId !== event.pointerId ||
			Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY) > 8 ||
			Math.abs((candidate.scrollOwner?.scrollLeft ?? 0) - candidate.startScrollLeft) > 1
		) {
			return;
		}
		this.activateLivePreviewEditor(event.target, event, true);
	};

	private readonly clearLivePreviewTouchTap = (): void => {
		this.touchTapCandidate = undefined;
	};

	constructor(plugin: ShikiPlugin, containerEl: HTMLElement, source: string, language: string, ctx: MarkdownPostProcessorContext) {
		super(containerEl);

		this.plugin = plugin;
		this.source = source;
		this.language = language;
		this.ctx = ctx;
		this.cachedMetaString = '';
		this.blockId = undefined;
	}

	private getMetaString(): string {
		const sectionInfo = this.ctx.getSectionInfo(this.containerEl);

		if (sectionInfo === null) {
			return '';
		}

		const lines = sectionInfo.text.split('\n');
		const startLine = lines[sectionInfo.lineStart];
		if (!startLine) {
			return '';
		}

		const meta = parseCodeBlockMeta(startLine);
		if (!meta) {
			return '';
		}

		return meta.rawMeta.trim();
	}

	private async render(): Promise<void> {
		try {
			this.blockId = await this.plugin.readingViewAdapter.renderBlock(this.containerEl, this.source, this.language, this.ctx);
		} catch (error) {
			console.error(`[Shiki] Failed to render ${this.language} code block:`, error);
			this.containerEl.empty();
			this.containerEl.createEl('pre', { text: this.source });
		}
	}

	public async rerenderOnNoteChange(): Promise<void> {
		// compare the new meta string to the cached one
		// only rerender if they are different, to avoid unnecessary work
		// since the meta string is likely to be the same most of the time
		// and if the code block content changes obsidian will rerender for us
		const newMetaString = this.getMetaString();
		if (newMetaString !== this.cachedMetaString) {
			this.cachedMetaString = newMetaString;
			await this.render();
		}
	}

	public async forceRerender(): Promise<void> {
		await this.render();
	}

	public onload(): void {
		super.onload();

		this.plugin.addActiveCodeBlock(this);
		this.containerEl.addEventListener('click', this.handleLivePreviewCodeClick);
		this.containerEl.addEventListener('pointerdown', this.handleLivePreviewPointerDown);
		this.containerEl.addEventListener('pointerup', this.handleLivePreviewPointerUp);
		this.containerEl.addEventListener('pointercancel', this.clearLivePreviewTouchTap);

		this.cachedMetaString = this.getMetaString();
		void this.render();
	}

	public onunload(): void {
		super.onunload();

		this.containerEl.removeEventListener('click', this.handleLivePreviewCodeClick);
		this.containerEl.removeEventListener('pointerdown', this.handleLivePreviewPointerDown);
		this.containerEl.removeEventListener('pointerup', this.handleLivePreviewPointerUp);
		this.containerEl.removeEventListener('pointercancel', this.clearLivePreviewTouchTap);
		this.touchTapCandidate = undefined;
		this.plugin.removeActiveCodeBlock(this);
		this.plugin.readingViewAdapter.disposeBlock(this.containerEl);

		this.containerEl.empty();
		this.containerEl.innerText = 'unloaded shiki code block';
	}
}
