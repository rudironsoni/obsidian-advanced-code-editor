import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { CodeBlockParser } from 'packages/obsidian/src/codeblocks/CodeBlockParser';
import type { CodeBlockLineInfo, CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';

interface LivePreviewStructureState {
	decorations: DecorationSet;
}

class ShikiLivePreviewHeaderWidget extends WidgetType {
	constructor(
		private readonly block: CodeBlockModel,
		private readonly plugin: ShikiPlugin,
	) {
		super();
	}

	eq(other: ShikiLivePreviewHeaderWidget): boolean {
		return other.block.id === this.block.id && other.block.language === this.block.language && other.block.code === this.block.code;
	}

	toDOM(): HTMLElement {
		const header = document.createElement('div');
		header.className = 'shiki-live-preview-header shiki-block-header';
		header.dataset.shikiBlockId = this.block.id;
		header.dataset.lang = this.block.language;

		const left = header.createDiv({ cls: 'shiki-header-left' });
		left.createSpan({ cls: 'shiki-lang-name', text: this.block.language });
		const right = header.createDiv({ cls: 'shiki-header-right' });
		const copyBtn = right.createEl('button', { cls: 'shiki-copy-button', text: 'Copy' });
		copyBtn.onclick = (event): void => {
			event.preventDefault();
			event.stopPropagation();
			navigator.clipboard.writeText(this.block.code).catch(() => {});
		};

		return header;
	}

	ignoreEvent(event: Event): boolean {
		return event.target instanceof Element && event.target.closest('.shiki-copy-button') !== null;
	}
}

class ShikiLivePreviewLineNumberWidget extends WidgetType {
	constructor(private readonly lineNumber: number) {
		super();
	}

	eq(other: ShikiLivePreviewLineNumberWidget): boolean {
		return other.lineNumber === this.lineNumber;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'shiki-live-preview-line-number';
		span.textContent = String(this.lineNumber);
		span.setAttribute('aria-hidden', 'true');
		return span;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

class ShikiLivePreviewFenceWidget extends WidgetType {
	constructor(private readonly text: string) {
		super();
	}

	eq(other: ShikiLivePreviewFenceWidget): boolean {
		return other.text === this.text;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'shiki-live-preview-fence-text';
		span.textContent = this.text;
		return span;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

class ShikiLivePreviewHorizontalScrollWidget extends WidgetType {
	private static readonly scrollLeftByBlock = new Map<string, number>();
	private readonly scrollKey: string;
	private cleanupDocumentPan: (() => void) | undefined;

	constructor(private readonly block: CodeBlockModel) {
		super();
		this.scrollKey = `${block.sourcePath}:${block.openingFenceLine ?? ''}:${block.closingFenceLine ?? ''}`;
	}

	eq(other: ShikiLivePreviewHorizontalScrollWidget): boolean {
		return other.block.id === this.block.id && other.block.code === this.block.code;
	}

	toDOM(): HTMLElement {
		const scroller = document.createElement('div');
		scroller.className = 'shiki-live-preview-horizontal-scroll';
		scroller.dataset.shikiBlockId = this.block.id;
		const ownerDocument = scroller.ownerDocument;
		const spacer = scroller.createDiv({ cls: 'shiki-live-preview-horizontal-scroll-spacer' });
		const escapedBlockId = CSS.escape(this.block.id);
		const rowSelector = `.cm-line[data-shiki-block-id="${escapedBlockId}"]`;
		const offsetStyle = ownerDocument.createElement('style');
		offsetStyle.dataset.shikiBlockId = this.block.id;
		ownerDocument.head.appendChild(offsetStyle);
		let rows: HTMLElement[] = [];
		let documentPointerId: number | null = null;
		let documentStartX = 0;
		let documentStartY = 0;
		let documentStartScrollLeft = 0;
		let documentHorizontal = false;
		const sync = (): void => {
			ShikiLivePreviewHorizontalScrollWidget.scrollLeftByBlock.set(this.scrollKey, scroller.scrollLeft);
			offsetStyle.textContent = `${rowSelector}{--shiki-live-preview-scroll-left:${scroller.scrollLeft}px;}`;
			for (const row of rows) {
				row.style.setProperty('--shiki-live-preview-scroll-left', `${scroller.scrollLeft}px`);
			}
		};
		const syncCurrentRows = (): void => {
			rows = [...scroller.ownerDocument.querySelectorAll<HTMLElement>(rowSelector)];
			sync();
		};
		const onDocumentPointerDown = (event: PointerEvent): void => {
			if (event.pointerType === 'mouse' && event.button !== 0) return;
			if (scroller.scrollWidth <= scroller.clientWidth) return;
			if (!(event.target instanceof Element) || !event.target.closest(rowSelector)) return;
			documentPointerId = event.pointerId;
			documentStartX = event.clientX;
			documentStartY = event.clientY;
			documentStartScrollLeft = scroller.scrollLeft;
			documentHorizontal = false;
		};
		const onDocumentPointerMove = (event: PointerEvent): void => {
			if (documentPointerId !== event.pointerId) return;
			const deltaX = event.clientX - documentStartX;
			const deltaY = event.clientY - documentStartY;
			if (!documentHorizontal && Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
				documentHorizontal = true;
			}
			if (!documentHorizontal) return;
			if (event.cancelable) event.preventDefault();
			scroller.scrollLeft = Math.max(0, documentStartScrollLeft - deltaX);
			syncCurrentRows();
		};
		const onDocumentPointerEnd = (event: PointerEvent): void => {
			if (documentPointerId !== event.pointerId) return;
			documentPointerId = null;
			documentHorizontal = false;
		};
		ownerDocument.addEventListener('pointerdown', onDocumentPointerDown, true);
		ownerDocument.addEventListener('pointermove', onDocumentPointerMove, true);
		ownerDocument.addEventListener('pointerup', onDocumentPointerEnd, true);
		ownerDocument.addEventListener('pointercancel', onDocumentPointerEnd, true);
		this.cleanupDocumentPan = (): void => {
			ownerDocument.removeEventListener('pointerdown', onDocumentPointerDown, true);
			ownerDocument.removeEventListener('pointermove', onDocumentPointerMove, true);
			ownerDocument.removeEventListener('pointerup', onDocumentPointerEnd, true);
			ownerDocument.removeEventListener('pointercancel', onDocumentPointerEnd, true);
			offsetStyle.remove();
		};
		const resize = (): void => {
			rows = [...scroller.ownerDocument.querySelectorAll<HTMLElement>(rowSelector)];
			const contents = [...scroller.ownerDocument.querySelectorAll<HTMLElement>(`${rowSelector} .shiki-live-preview-scroll-content`)];
			let width = scroller.clientWidth;
			for (const content of contents) {
				width = Math.max(width, content.scrollWidth + content.offsetLeft + 24);
			}
			spacer.style.width = `${Math.ceil(width)}px`;
			scroller.scrollLeft = ShikiLivePreviewHorizontalScrollWidget.scrollLeftByBlock.get(this.scrollKey) ?? scroller.scrollLeft;
			sync();
		};
		scroller.onscroll = sync;
		scroller.onwheel = (event): void => {
			if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || scroller.scrollWidth <= scroller.clientWidth) return;
			event.preventDefault();
			scroller.scrollLeft += event.deltaX;
		};
		requestAnimationFrame(resize);
		return scroller;
	}

	destroy(): void {
		this.cleanupDocumentPan?.();
		this.cleanupDocumentPan = undefined;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function openingFenceText(block: CodeBlockModel): string {
	const fence = block.openingFence ?? '```';
	const meta = block.meta.trim();
	return `${fence}${block.language}${meta ? ` ${meta}` : ''}`;
}

export function createLivePreviewStructureExtension(plugin: ShikiPlugin): Extension {
	const parser = new CodeBlockParser();

	const buildState = (state: EditorState): LivePreviewStructureState => {
		if (!isLivePreviewActive(plugin)) {
			return { decorations: Decoration.none };
		}
		const lines = collectLines(state);
		const parsed = parser.parseLivePreviewBlocks(lines);
		const decorations = new RangeSetBuilder<Decoration>();

		for (const parsedBlock of parsed) {
			const block = plugin.codeBlockRegistry.createModel({
				sourcePath: plugin.app.workspace.getActiveFile()?.path ?? '',
				hostMode: 'live-preview',
				language: parsedBlock.language,
				meta: parsedBlock.meta.raw.trim(),
				code: state.doc.sliceString(parsedBlock.range.charFrom, parsedBlock.range.charTo),
				fenceFrom: state.doc.line(parsedBlock.openingFenceLine).from,
				fenceTo: state.doc.line(parsedBlock.closingFenceLine).to,
				codeFrom: parsedBlock.range.charFrom,
				codeTo: parsedBlock.range.charTo,
				sectionStartLine: parsedBlock.openingFenceLine,
				sectionEndLine: parsedBlock.closingFenceLine,
				openingFence: parsedBlock.meta.openingFence,
				openingFenceLine: parsedBlock.openingFenceLine,
				closingFenceLine: parsedBlock.closingFenceLine,
			});
			plugin.codeBlockRegistry.upsert(block);

			if (block.fenceFrom === undefined || block.codeFrom === undefined || block.codeTo === undefined) {
				continue;
			}

			decorations.add(block.fenceFrom, block.fenceFrom, Decoration.widget({ widget: new ShikiLivePreviewHeaderWidget(block, plugin), block: true, side: -1 }));

			for (let lineNumber = parsedBlock.openingFenceLine; lineNumber <= parsedBlock.closingFenceLine; lineNumber++) {
				const line = state.doc.line(lineNumber);
				const isOpeningFence = lineNumber === parsedBlock.openingFenceLine;
				const isClosingFence = lineNumber === parsedBlock.closingFenceLine;
				const className = isOpeningFence
					? 'shiki-live-preview-fence-line shiki-live-preview-opening-fence-line'
					: isClosingFence
						? 'shiki-live-preview-fence-line shiki-live-preview-closing-fence-line'
						: `shiki-live-preview-code-line${plugin.loadedSettings.wrapLines ? ' shiki-live-preview-code-line-wrap' : ' shiki-live-preview-code-line-nowrap'}`;
				decorations.add(
					line.from,
					line.from,
					Decoration.line({
						attributes: {
							class: className,
							'data-shiki-block-id': block.id,
							'data-shiki-editing-block-id': block.id,
						},
					}),
				);

				if (isOpeningFence || isClosingFence) {
					decorations.add(
						line.from,
						line.to,
						Decoration.replace({ widget: new ShikiLivePreviewFenceWidget(isOpeningFence ? openingFenceText(block) : (block.openingFence ?? '```')) }),
					);
				}

				if (!isOpeningFence && !isClosingFence && plugin.loadedSettings.showLineNumbers) {
					decorations.add(
						line.from,
						line.from,
						Decoration.widget({ widget: new ShikiLivePreviewLineNumberWidget(lineNumber - parsedBlock.openingFenceLine), side: -1 }),
					);
				}

				if (!isOpeningFence && !isClosingFence && !plugin.loadedSettings.wrapLines && line.from < line.to) {
					decorations.add(line.from, line.to, Decoration.mark({ attributes: { class: 'shiki-live-preview-scroll-content' } }));
				}
			}

			if (!plugin.loadedSettings.wrapLines && block.fenceTo !== undefined) {
				decorations.add(block.fenceTo, block.fenceTo, Decoration.widget({ widget: new ShikiLivePreviewHorizontalScrollWidget(block), block: true, side: 1 }));
			}
		}

		return { decorations: decorations.finish() };
	};

	const structureField = StateField.define<LivePreviewStructureState>({
		create: buildState,
		update(_value, transaction) {
			return buildState(transaction.state);
		},
		provide: field => [
			EditorView.decorations.from(field, value => value.decorations),
		],
	});

	return structureField;
}

function isLivePreviewActive(plugin: ShikiPlugin): boolean {
	const activeContainer = plugin.app.workspace.activeLeaf?.view?.containerEl;
	return !!activeContainer && activeContainer.querySelector('.markdown-source-view.mod-cm6.is-live-preview') !== null;
}

function collectLines(state: EditorState): CodeBlockLineInfo[] {
	const lines: CodeBlockLineInfo[] = [];
	for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
		const line = state.doc.line(lineNumber);
		lines.push({ lineNumber, text: line.text, from: line.from, to: line.to });
	}
	return lines;
}
