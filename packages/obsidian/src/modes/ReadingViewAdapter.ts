import type { MarkdownPostProcessorContext } from 'obsidian';
import { parseCodeBlockMeta } from 'packages/obsidian/src/codeblocks/CodeBlockMeta';
import type { CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';
import { SHIKI_READING_TOKEN_CLASS, SHIKI_TOKEN_CLASS } from 'packages/obsidian/src/ShikiHighlighter';

interface ReadingBlockState {
	block: CodeBlockModel;
	container: HTMLElement;
	ctx: MarkdownPostProcessorContext;
	language: string;
	observer: MutationObserver | undefined;
	releaseTimer: number | undefined;
	renderRequestId: number;
}

export class ReadingViewAdapter {
	private readonly plugin: ShikiPlugin;
	private readonly blockIdsByContainer = new WeakMap<HTMLElement, string>();
	private readonly blockStates = new Map<string, ReadingBlockState>();

	constructor(plugin: ShikiPlugin) {
		this.plugin = plugin;
	}

	async renderBlock(container: HTMLElement, source: string, language: string, ctx: MarkdownPostProcessorContext): Promise<string | undefined> {
		const block = this.buildBlockModel(container, source, language, ctx);
		if (!block) {
			return undefined;
		}
		this.plugin.codeBlockRegistry.upsert(block);
		const previousState = this.blockStates.get(block.id);
		if (previousState?.releaseTimer !== undefined) {
			window.clearTimeout(previousState.releaseTimer);
		}
		previousState?.observer?.disconnect();
		const state: ReadingBlockState = {
			block,
			container,
			ctx,
			language: language.toLowerCase(),
			observer: undefined,
			releaseTimer: undefined,
			renderRequestId: 0,
		};
		this.blockStates.set(block.id, state);
		this.enhanceBlock(state);
		this.scheduleAttachmentCheck(state);
		this.blockIdsByContainer.set(container, block.id);
		return block.id;
	}

	disposeBlock(container: HTMLElement): void {
		const blockId = this.blockIdsByContainer.get(container);
		if (!blockId) {
			return;
		}
		this.blockIdsByContainer.delete(container);
		const state = this.blockStates.get(blockId);
		if (!state) {
			this.plugin.codeBlockRegistry.delete(blockId);
			return;
		}
		if (state.container !== container) {
			return;
		}
		state.releaseTimer = window.setTimeout(() => {
			if (state.container.isConnected) {
				return;
			}
			state.observer?.disconnect();
			this.blockStates.delete(blockId);
			this.plugin.codeBlockRegistry.delete(blockId);
		}, 250);
	}

	private enhanceBlock(state: ReadingBlockState): void {
		const container = state.container;
		if (!container.isConnected) {
			return;
		}

		const pre = container.querySelector('pre') ?? (container.tagName === 'PRE' ? container : null);
		const codeElement = pre?.querySelector('code');
		if (!pre || !codeElement) {
			return;
		}

		const wrapper = container.tagName === 'PRE' ? (container.parentElement ?? container) : container;
		const existingBody = wrapper.querySelector<HTMLElement>(':scope > .shiki-block-body');
		const existingHeader = wrapper.querySelector<HTMLElement>(':scope > .shiki-block-header');
		const doc = container.ownerDocument;

		wrapper.classList.add('shiki-reading-block');
		wrapper.dataset.shikiBlockId = state.block.id;
		wrapper.dataset.shikiScrollOwner = 'false';
		wrapper.classList.remove('wrap-lines');
		if (this.plugin.loadedSettings.wrapLines) {
			wrapper.classList.add('wrap-lines');
		}
		this.claimRenderedCodeElement(pre, codeElement, state.block.language);
		pre.dataset.shikiBlockId = state.block.id;
		codeElement.dataset.shikiBlockId = state.block.id;
		if (existingHeader) {
			existingHeader.dataset.shikiBlockId = state.block.id;
			existingHeader.dataset.shikiScrollOwner = 'false';
		}
		if (existingBody) {
			existingBody.dataset.shikiBlockId = state.block.id;
			existingBody.dataset.shikiScrollOwner = 'false';
		}
		const existingScroll = existingBody?.querySelector<HTMLElement>(':scope > .shiki-code-scroll');
		if (existingScroll) {
			existingScroll.classList.add('shiki-block-horizontal-scrollbar');
			existingScroll.dataset.shikiBlockId = state.block.id;
			existingScroll.dataset.shikiScrollOwner = 'true';
			if (this.plugin.loadedSettings.wrapLines) {
				existingScroll.dataset.shikiScrollDisabled = 'true';
				pre.style.whiteSpace = '';
				codeElement.style.whiteSpace = '';
			} else {
				delete existingScroll.dataset.shikiScrollDisabled;
				pre.style.whiteSpace = 'pre';
				codeElement.style.whiteSpace = 'pre';
			}
		}
		if (existingBody) {
			void this.applyShikiHighlight(state, codeElement);
			return;
		}
		for (const stale of wrapper.querySelectorAll(':scope > .shiki-block-header, :scope > .shiki-block-body, :scope > .shiki-code-scroll')) {
			stale.remove();
		}

		const header = doc.createElement('div');
		header.className = 'shiki-block-header';
		header.dataset.shikiBlockId = state.block.id;
		header.dataset.shikiScrollOwner = 'false';
		const left = header.createDiv({ cls: 'shiki-header-left' });
		left.createSpan({ cls: 'shiki-lang-name', text: state.language });
		const right = header.createDiv({ cls: 'shiki-header-right' });
		const copyBtn = right.createEl('button', { cls: 'shiki-copy-button', text: 'Copy' });
		copyBtn.onclick = (): void => {
			navigator.clipboard.writeText(state.block.code).catch(() => {});
		};

		const body = doc.createElement('div');
		body.className = 'shiki-block-body';
		body.dataset.shikiBlockId = state.block.id;
		body.dataset.shikiScrollOwner = 'false';
		const scroll = body.createDiv({ cls: 'shiki-code-scroll shiki-block-horizontal-scrollbar' });
		scroll.dataset.shikiBlockId = state.block.id;
		scroll.dataset.shikiScrollOwner = 'true';
		if (this.plugin.loadedSettings.wrapLines) {
			scroll.dataset.shikiScrollDisabled = 'true';
		}
		pre.remove();
		if (container !== wrapper && container !== pre && container.childElementCount === 0 && container.textContent?.trim() === '') {
			container.remove();
		}
		scroll.appendChild(pre);
		wrapper.appendChild(header);
		wrapper.appendChild(body);

		if (!this.plugin.loadedSettings.wrapLines) {
			pre.style.whiteSpace = 'pre';
			codeElement.style.whiteSpace = 'pre';
		} else {
			pre.style.whiteSpace = '';
			codeElement.style.whiteSpace = '';
		}

		void this.applyShikiHighlight(state, codeElement);
	}

	private async applyShikiHighlight(state: ReadingBlockState, codeElement: HTMLElement, attempt = 0): Promise<void> {
		const requestId = ++state.renderRequestId;
		const pre = codeElement.closest<HTMLElement>('pre');
		if (pre) {
			this.claimRenderedCodeElement(pre, codeElement, state.block.language);
		}
		codeElement.textContent = state.block.code;
		codeElement.dataset.shikiHighlightState = 'pending';
		this.syncLineNumbers(state, codeElement);

		const highlight = await this.plugin.highlighter.getHighlightTokens(state.block.code, state.block.language);
		if (!this.isCurrentRender(state, codeElement, requestId)) {
			return;
		}
		if (!highlight) {
			if (attempt < 2) {
				window.setTimeout(() => {
					if (this.isCurrentRender(state, codeElement, requestId)) {
						void this.applyShikiHighlight(state, codeElement, attempt + 1);
					}
				}, 150);
				return;
			}
			codeElement.dataset.shikiHighlightState = 'plain';
			return;
		}
		const themeBackground = this.plugin.highlighter.getThemeBackground(highlight);
		if (themeBackground) {
			codeElement.closest<HTMLElement>('.shiki-reading-block')?.style.setProperty('--shiki-code-background', themeBackground);
		}

		const lines = state.block.code.split('\n');

		// Preserve the original code text but replace with Shiki-colored spans
		codeElement.empty();
		const tokenLines = this.plugin.highlighter.getTokenSegments(state.block.code, highlight.tokens);
		let renderedTokenCount = 0;
		for (let i = 0; i < lines.length; i++) {
			const lineSegments = tokenLines[i];
			if (!lineSegments?.length) {
				codeElement.appendChild(codeElement.ownerDocument.createTextNode(lines[i] ?? ''));
			} else {
				for (const segment of lineSegments) {
					if (!segment.token) {
						codeElement.appendChild(codeElement.ownerDocument.createTextNode(segment.text));
						continue;
					}
					const tokenStyle = this.plugin.highlighter.getTokenStyle(segment.token);
					const span = codeElement.ownerDocument.createElement('span');
					span.textContent = segment.text;
					span.classList.add(SHIKI_TOKEN_CLASS, SHIKI_READING_TOKEN_CLASS);
					for (const tokenClass of tokenStyle.classes) {
						if (tokenClass) {
							span.classList.add(tokenClass);
						}
					}
					span.style.cssText = tokenStyle.style;
					codeElement.appendChild(span);
					renderedTokenCount++;
				}
			}
			if (i < lines.length - 1) {
				codeElement.appendChild(codeElement.ownerDocument.createTextNode('\n'));
			}
		}

		codeElement.dataset.shikiHighlightState = 'rendered';
		this.syncLineNumbers(state, codeElement);
		this.scheduleTokenRetentionCheck(state, codeElement, requestId, attempt, renderedTokenCount);
	}

	private claimRenderedCodeElement(pre: HTMLElement, codeElement: HTMLElement, language: string): void {
		pre.dataset.shikiLanguage = language;
		codeElement.dataset.shikiLanguage = language;
		for (const element of [pre, codeElement]) {
			for (const className of [...element.classList]) {
				if (className.startsWith('language-')) {
					element.classList.remove(className);
				}
			}
		}
	}

	private isCurrentRender(state: ReadingBlockState, codeElement: HTMLElement, requestId: number): boolean {
		return (
			state.renderRequestId === requestId &&
			this.blockStates.get(state.block.id) === state &&
			state.container.isConnected &&
			codeElement.isConnected &&
			codeElement.dataset.shikiBlockId === state.block.id
		);
	}

	private scheduleTokenRetentionCheck(
		state: ReadingBlockState,
		codeElement: HTMLElement,
		requestId: number,
		attempt: number,
		expectedTokenCount: number,
	): void {
		window.setTimeout(() => {
			if (!this.isCurrentRender(state, codeElement, requestId)) {
				return;
			}
			if (expectedTokenCount <= 0 || codeElement.querySelector(`.${SHIKI_READING_TOKEN_CLASS}`)) {
				return;
			}
			if (attempt < 2) {
				void this.applyShikiHighlight(state, codeElement, attempt + 1);
			}
		}, 100);
	}

	private syncLineNumbers(state: ReadingBlockState, codeElement: HTMLElement): void {
		const blockRoot = codeElement.closest<HTMLElement>('.shiki-reading-block');
		if (blockRoot) {
			for (const lineNumbers of [...blockRoot.querySelectorAll('.shiki-line-numbers')]) {
				lineNumbers.remove();
			}
		}
		const bodyEl = codeElement.closest<HTMLElement>('.shiki-block-body');
		if (bodyEl) {
			if (!this.plugin.loadedSettings.showLineNumbers) {
				bodyEl.style.display = '';
			}
		}
		if (this.plugin.loadedSettings.showLineNumbers) {
			if (bodyEl && !bodyEl.querySelector('.shiki-line-numbers')) {
				bodyEl.style.display = 'flex';
				const lineNumbers = codeElement.ownerDocument.createElement('div');
				lineNumbers.className = 'shiki-line-numbers';
				lineNumbers.dataset.shikiBlockId = state.block.id;
				lineNumbers.dataset.shikiScrollOwner = 'false';
				for (let i = 1; i <= state.block.code.split('\n').length; i++) {
					lineNumbers.createSpan({ text: String(i) });
				}
				bodyEl.insertBefore(lineNumbers, bodyEl.firstChild);
			}
		}
	}

	private scheduleAttachmentCheck(state: ReadingBlockState): void {
		const attach = (): void => {
			if (!state.container.isConnected) {
				return;
			}
			this.enhanceBlock(state);
		};
		// Single delayed check; the post-processor already calls us at the right time,
		// but give the DOM a moment to settle before enhancing.
		window.setTimeout(attach, 50);
	}

	private buildBlockModel(container: HTMLElement, source: string, language: string, ctx: MarkdownPostProcessorContext): CodeBlockModel | undefined {
		const sectionInfo = ctx.getSectionInfo(container);
		const sectionText = sectionInfo?.text ?? '';
		const lines = sectionText.split('\n');
		const openingLine = sectionInfo ? (lines[sectionInfo.lineStart] ?? '') : '';
		const meta = parseCodeBlockMeta(openingLine);
		return this.plugin.codeBlockRegistry.createModel({
			sourcePath: ctx.sourcePath,
			hostMode: 'reading',
			language: language.toLowerCase(),
			meta: meta?.rawMeta.trim() ?? '',
			code: normalizeReadingCodeSource(source),
			sectionStartLine: sectionInfo?.lineStart,
			sectionEndLine: sectionInfo?.lineEnd,
			openingFence: meta?.openingFence,
			openingFenceLine: sectionInfo?.lineStart,
		});
	}
}

export function normalizeReadingCodeSource(source: string): string {
	const normalized = source.endsWith('\n') ? source.slice(0, -1) : source;
	const lines = normalized.split('\n');
	const openingLineIndex = lines.findIndex(line => line.trim() !== '');
	if (openingLineIndex < 0) {
		return normalized;
	}

	const opening = parseCodeBlockMeta(lines[openingLineIndex] ?? '');
	if (!opening) {
		return normalized;
	}

	let closingLineIndex = lines.length - 1;
	while (closingLineIndex > openingLineIndex && (lines[closingLineIndex] ?? '').trim() === '') {
		closingLineIndex -= 1;
	}
	if (!isClosingFenceLine(lines[closingLineIndex] ?? '', opening.openingFence)) {
		return normalized;
	}

	return lines.slice(openingLineIndex + 1, closingLineIndex).join('\n');
}

function isClosingFenceLine(line: string, openingFence: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length < openingFence.length) {
		return false;
	}
	if (!trimmed.startsWith(openingFence)) {
		return false;
	}
	return [...trimmed].every(character => character === openingFence[0]);
}
