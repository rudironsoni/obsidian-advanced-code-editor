import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
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

function openingFenceText(block: CodeBlockModel): string {
	const fence = block.openingFence ?? '```';
	const meta = block.meta.trim();
	return `${fence}${block.language}${meta ? ` ${meta}` : ''}`;
}

export function createLivePreviewStructureExtension(plugin: ShikiPlugin): Extension {
	const parser = new CodeBlockParser();
	const scrollLeftByBlock = new Map<string, number>();

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

	const scrollSyncPlugin = ViewPlugin.fromClass(
		class LivePreviewScrollSyncPlugin {
			private syncing = false;
			private touchBlockId: string | undefined;
			private touchStartX = 0;
			private touchStartY = 0;
			private touchStartScrollLeft = 0;
			private touchHorizontal = false;
			private pointerId: number | undefined;
			private pointerBlockId: string | undefined;
			private pointerStartX = 0;
			private pointerStartY = 0;
			private pointerStartScrollLeft = 0;
			private pointerHorizontal = false;

			constructor(private readonly view: EditorView) {
				this.view.scrollDOM.addEventListener('scroll', this.onScroll, true);
				this.view.scrollDOM.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
				this.view.scrollDOM.addEventListener('pointerdown', this.onPointerDown, true);
				this.view.scrollDOM.addEventListener('pointermove', this.onPointerMove, true);
				this.view.scrollDOM.addEventListener('pointerup', this.onPointerEnd, true);
				this.view.scrollDOM.addEventListener('pointercancel', this.onPointerEnd, true);
				this.view.scrollDOM.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: false });
				this.view.scrollDOM.addEventListener('touchmove', this.onTouchMove, { capture: true, passive: false });
				this.view.scrollDOM.addEventListener('touchend', this.onTouchEnd, true);
				this.view.scrollDOM.addEventListener('touchcancel', this.onTouchEnd, true);
				this.view.dom.ownerDocument.addEventListener('pointerdown', this.onPointerDown, true);
				this.view.dom.ownerDocument.addEventListener('pointermove', this.onPointerMove, true);
				this.view.dom.ownerDocument.addEventListener('pointerup', this.onPointerEnd, true);
				this.view.dom.ownerDocument.addEventListener('pointercancel', this.onPointerEnd, true);
				this.view.dom.ownerDocument.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: false });
				this.view.dom.ownerDocument.addEventListener('touchmove', this.onTouchMove, { capture: true, passive: false });
				this.view.dom.ownerDocument.addEventListener('touchend', this.onTouchEnd, true);
				this.view.dom.ownerDocument.addEventListener('touchcancel', this.onTouchEnd, true);
				this.view.dom.ownerDocument.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
				this.applyStoredScrolls();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged) {
					this.applyStoredScrolls();
				}
			}

			destroy(): void {
				this.view.scrollDOM.removeEventListener('scroll', this.onScroll, true);
				this.view.scrollDOM.removeEventListener('wheel', this.onWheel, true);
				this.view.scrollDOM.removeEventListener('pointerdown', this.onPointerDown, true);
				this.view.scrollDOM.removeEventListener('pointermove', this.onPointerMove, true);
				this.view.scrollDOM.removeEventListener('pointerup', this.onPointerEnd, true);
				this.view.scrollDOM.removeEventListener('pointercancel', this.onPointerEnd, true);
				this.view.scrollDOM.removeEventListener('touchstart', this.onTouchStart, true);
				this.view.scrollDOM.removeEventListener('touchmove', this.onTouchMove, true);
				this.view.scrollDOM.removeEventListener('touchend', this.onTouchEnd, true);
				this.view.scrollDOM.removeEventListener('touchcancel', this.onTouchEnd, true);
				this.view.dom.ownerDocument.removeEventListener('pointerdown', this.onPointerDown, true);
				this.view.dom.ownerDocument.removeEventListener('pointermove', this.onPointerMove, true);
				this.view.dom.ownerDocument.removeEventListener('pointerup', this.onPointerEnd, true);
				this.view.dom.ownerDocument.removeEventListener('pointercancel', this.onPointerEnd, true);
				this.view.dom.ownerDocument.removeEventListener('touchstart', this.onTouchStart, true);
				this.view.dom.ownerDocument.removeEventListener('touchmove', this.onTouchMove, true);
				this.view.dom.ownerDocument.removeEventListener('touchend', this.onTouchEnd, true);
				this.view.dom.ownerDocument.removeEventListener('touchcancel', this.onTouchEnd, true);
				this.view.dom.ownerDocument.removeEventListener('wheel', this.onWheel, true);
			}

			private readonly onScroll = (event: Event): void => {
				if (this.syncing) {
					return;
				}
				const source = event.target;
				if (!(source instanceof HTMLElement) || !source.classList.contains('shiki-live-preview-code-line')) {
					return;
				}
				const blockId = source.dataset.shikiBlockId;
				if (!blockId) {
					return;
				}
				this.syncBlockRows(blockId, source.scrollLeft);
			};

			private readonly onWheel = (event: WheelEvent): void => {
				const target = this.scrollTargetFromEvent(event.target, event.clientX, event.clientY);
				if (!target) {
					return;
				}
				const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
				if (horizontalDelta === 0) {
					return;
				}
				const normalizedDelta = this.normalizeWheelDelta(horizontalDelta, event.deltaMode, target.blockId);
				const nextScrollLeft = this.clampBlockScrollLeft(target.blockId, target.scrollLeft + normalizedDelta);
				if (nextScrollLeft === target.scrollLeft) {
					return;
				}
				if (event.cancelable) {
					event.preventDefault();
				}
				event.stopPropagation();
				this.syncBlockRows(target.blockId, nextScrollLeft);
			};

			private readonly onPointerDown = (event: PointerEvent): void => {
				if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
					return;
				}
				const target = this.scrollTargetFromEvent(event.target, event.clientX, event.clientY);
				if (!target) {
					this.resetPointer();
					return;
				}
				this.pointerId = event.pointerId;
				this.pointerBlockId = target.blockId;
				this.pointerStartX = event.clientX;
				this.pointerStartY = event.clientY;
				this.pointerStartScrollLeft = target.scrollLeft;
				this.pointerHorizontal = false;
			};

			private readonly onPointerMove = (event: PointerEvent): void => {
				if (this.pointerId !== event.pointerId || !this.pointerBlockId) {
					return;
				}
				const deltaX = event.clientX - this.pointerStartX;
				const deltaY = event.clientY - this.pointerStartY;
				if (!this.pointerHorizontal && Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
					this.pointerHorizontal = true;
				}
				if (!this.pointerHorizontal) {
					return;
				}
				if (event.cancelable) {
					event.preventDefault();
				}
				event.stopPropagation();
				this.syncBlockRows(this.pointerBlockId, this.pointerStartScrollLeft - deltaX);
			};

			private readonly onPointerEnd = (event: PointerEvent): void => {
				if (this.pointerId === event.pointerId) {
					this.resetPointer();
				}
			};

			private readonly onTouchStart = (event: TouchEvent): void => {
				const touch = event.changedTouches[0];
				const target = touch ? this.scrollTargetFromEvent(event.target, touch.clientX, touch.clientY) : undefined;
				if (!target || !touch) {
					this.resetTouch();
					return;
				}
				this.touchBlockId = target.blockId;
				this.touchStartX = touch.clientX;
				this.touchStartY = touch.clientY;
				this.touchStartScrollLeft = target.scrollLeft;
				this.touchHorizontal = false;
			};

			private readonly onTouchMove = (event: TouchEvent): void => {
				if (!this.touchBlockId) {
					return;
				}
				const touch = event.changedTouches[0];
				if (!touch) {
					return;
				}
				const deltaX = touch.clientX - this.touchStartX;
				const deltaY = touch.clientY - this.touchStartY;
				if (!this.touchHorizontal && Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
					this.touchHorizontal = true;
				}
				if (!this.touchHorizontal) {
					return;
				}
				if (event.cancelable) {
					event.preventDefault();
				}
				event.stopPropagation();
				this.syncBlockRows(this.touchBlockId, this.touchStartScrollLeft - deltaX);
			};

			private readonly onTouchEnd = (): void => {
				this.resetTouch();
			};

			private syncBlockRows(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				scrollLeftByBlock.set(blockId, nextScrollLeft);
				this.syncing = true;
				try {
					for (const row of this.codeRowsForBlock(blockId)) {
						row.scrollLeft = nextScrollLeft;
					}
				} finally {
					this.syncing = false;
				}
			}

			private resetTouch(): void {
				this.touchBlockId = undefined;
				this.touchHorizontal = false;
			}

			private resetPointer(): void {
				this.pointerId = undefined;
				this.pointerBlockId = undefined;
				this.pointerHorizontal = false;
			}

			private scrollTargetFromEvent(target: EventTarget | null, clientX?: number, clientY?: number): { blockId: string; scrollLeft: number } | undefined {
				const targetBlockId = this.blockIdFromElement(target instanceof Element ? target : undefined);
				if (targetBlockId) {
					return { blockId: targetBlockId, scrollLeft: this.blockScrollLeft(targetBlockId) };
				}
				if (clientX === undefined || clientY === undefined) {
					return undefined;
				}
				const pointBlockId = this.blockIdFromElement(this.view.root.elementFromPoint(clientX, clientY) ?? undefined);
				if (pointBlockId) {
					return { blockId: pointBlockId, scrollLeft: this.blockScrollLeft(pointBlockId) };
				}
				const coordinateBlockId = this.blockIdFromPoint(clientX, clientY);
				return coordinateBlockId ? { blockId: coordinateBlockId, scrollLeft: this.blockScrollLeft(coordinateBlockId) } : undefined;
			}

			private blockIdFromElement(element: Element | undefined): string | undefined {
				if (!element || !this.view.dom.contains(element)) {
					return undefined;
				}
				const blockElement = element.closest<HTMLElement>('[data-shiki-block-id]');
				const blockId = blockElement?.dataset.shikiBlockId;
				if (blockId && this.codeRowsForBlock(blockId).length > 0) {
					return blockId;
				}
				return undefined;
			}

			private blockScrollLeft(blockId: string): number {
				return Math.max(0, ...this.codeRowsForBlock(blockId).map(row => row.scrollLeft), scrollLeftByBlock.get(blockId) ?? 0);
			}

			private clampBlockScrollLeft(blockId: string, scrollLeft: number): number {
				const maxScrollLeft = Math.max(0, ...this.codeRowsForBlock(blockId).map(row => row.scrollWidth - row.clientWidth));
				return Math.max(0, Math.min(scrollLeft, maxScrollLeft));
			}

			private normalizeWheelDelta(delta: number, deltaMode: number, blockId: string): number {
				if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
					return delta * 16;
				}
				if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
					return delta * (this.codeRowsForBlock(blockId)[0]?.clientWidth ?? 1);
				}
				return delta;
			}

			private blockIdFromPoint(clientX: number, clientY: number): string | undefined {
				const blockIds = new Set<string>();
				for (const element of this.view.dom.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) {
						blockIds.add(blockId);
					}
				}

				for (const blockId of blockIds) {
					const elements = [...this.view.dom.querySelectorAll<HTMLElement>(`[data-shiki-block-id="${CSS.escape(blockId)}"]`)];
					const rects = elements
						.map(element => element.getBoundingClientRect())
						.filter(rect => rect.width > 0 && rect.height > 0);
					if (rects.length === 0 || this.codeRowsForBlock(blockId).length === 0) {
						continue;
					}
					const left = Math.min(...rects.map(rect => rect.left));
					const right = Math.max(...rects.map(rect => rect.right));
					const top = Math.min(...rects.map(rect => rect.top));
					const bottom = Math.max(...rects.map(rect => rect.bottom));
					if (clientX >= left - 48 && clientX <= right + 4 && clientY >= top && clientY <= bottom) {
						return blockId;
					}
				}
				return undefined;
			}

			private applyStoredScrolls(): void {
				for (const [blockId, scrollLeft] of scrollLeftByBlock) {
					for (const row of this.codeRowsForBlock(blockId)) {
						row.scrollLeft = scrollLeft;
					}
				}
			}

			private codeRowsForBlock(blockId: string): HTMLElement[] {
				return [...this.view.dom.querySelectorAll<HTMLElement>(`.cm-line.shiki-live-preview-code-line[data-shiki-block-id="${CSS.escape(blockId)}"]`)];
			}
		},
	);

	return [structureField, scrollSyncPlugin];
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
