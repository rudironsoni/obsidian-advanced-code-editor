import type { Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from '@codemirror/view';

export const SHIKI_BLOCK_SCROLL_ROW_CLASS = 'shiki-block-scroll-row';
export const SHIKI_BLOCK_SCROLLBAR_CLASS = 'shiki-block-horizontal-scrollbar';
export const SHIKI_BLOCK_SCROLLBAR_INNER_CLASS = 'shiki-block-horizontal-scrollbar-inner';
export const SHIKI_BLOCK_SCROLL_SPACER_CLASS = 'shiki-block-scroll-spacer';

export class ShikiBlockHorizontalScrollbarWidget extends WidgetType {
	constructor(
		private readonly blockId: string,
		private readonly wrapLines: boolean,
	) {
		super();
	}

	eq(other: ShikiBlockHorizontalScrollbarWidget): boolean {
		return other.blockId === this.blockId && other.wrapLines === this.wrapLines;
	}

	toDOM(): HTMLElement {
		const scrollbar = document.createElement('div');
		scrollbar.className = SHIKI_BLOCK_SCROLLBAR_CLASS;
		scrollbar.dataset.shikiBlockId = this.blockId;
		scrollbar.dataset.shikiScrollOwner = 'true';
		if (this.wrapLines) {
			scrollbar.dataset.shikiScrollDisabled = 'true';
		}

		const inner = scrollbar.createDiv({ cls: SHIKI_BLOCK_SCROLLBAR_INNER_CLASS });
		inner.setAttribute('aria-hidden', 'true');
		return scrollbar;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

export function createBlockHorizontalScrollbarDecoration(blockId: string, wrapLines: boolean): Decoration {
	return Decoration.widget({
		widget: new ShikiBlockHorizontalScrollbarWidget(blockId, wrapLines),
		block: true,
		side: 1,
	});
}

class ShikiBlockScrollSpacerWidget extends WidgetType {
	constructor(private readonly blockId: string) {
		super();
	}

	eq(other: ShikiBlockScrollSpacerWidget): boolean {
		return other.blockId === this.blockId;
	}

	toDOM(): HTMLElement {
		const spacer = document.createElement('span');
		spacer.className = SHIKI_BLOCK_SCROLL_SPACER_CLASS;
		spacer.dataset.shikiBlockId = this.blockId;
		spacer.setAttribute('aria-hidden', 'true');
		return spacer;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

export function createBlockHorizontalScrollSpacerDecoration(blockId: string): Decoration {
	return Decoration.widget({
		widget: new ShikiBlockScrollSpacerWidget(blockId),
		side: 1,
	});
}

export function stableBlockScrollMemoryKey(blockId: string): string {
	const parts = blockId.split('::');
	return parts.length > 1 ? parts.slice(0, -1).join('::') : blockId;
}

interface BlockScrollCache {
	rows: HTMLElement[];
	scrollbars: HTMLElement[];
	headers: HTMLElement[];
	innerScrollbars: HTMLElement[];
	maxScrollLeft: number;
	maxScrollWidth: number;
	clipWidth: number;
	disabled: boolean;
}

interface BlockScrollMeasure {
	blockId: string;
	rows: HTMLElement[];
	scrollbars: HTMLElement[];
	headers: HTMLElement[];
	innerScrollbars: HTMLElement[];
	rowScrollWidths: number[];
	rowClientWidths: number[];
	scrollbarClientWidths: number[];
	maxScrollLeft: number;
	maxScrollWidth: number;
	clipWidth: number;
	disabled: boolean;
}

export function createBlockHorizontalScrollPlugin(): Extension {
	return ViewPlugin.fromClass(
		class BlockHorizontalScrollPlugin {
			private readonly scrollLeftByBlock = new Map<string, number>();
			private syncing = false;
			private touchBlockId: string | undefined;
			private touchStartX = 0;
			private touchStartY = 0;
			private touchStartScrollLeft = 0;
			private touchHorizontal = false;
			private touchId: number | undefined;
			private pointerId: number | undefined;
			private pointerBlockId: string | undefined;
			private pointerStartX = 0;
			private pointerStartY = 0;
			private pointerStartScrollLeft = 0;
			private pointerHorizontal = false;
			private pointerCaptureTarget: HTMLElement | undefined;
			private readonly resizeObserver: ResizeObserver | undefined;
			private readonly observedScrollTargets = new Set<HTMLElement>();
			private readonly observedResizeTargets = new Set<HTMLElement>();
			private readonly domObserver: MutationObserver;
			private readonly blockCacheById = new Map<string, BlockScrollCache>();
			private readonly rowNativeMaxScrollLeftByElement = new WeakMap<HTMLElement, number>();
			private readonly expectedScrollLeftByElement = new WeakMap<HTMLElement, number>();
			private readonly pendingScrollLeftByBlock = new Map<string, number>();
			private readonly immediateGestureSyncBlockIds = new Set<string>();
			private scrollFlushFrame: number | undefined;
			private gestureFrameReset: number | undefined;
			private measureScheduled = false;

			constructor(private readonly view: EditorView) {
				this.domObserver = new MutationObserver(this.onDomMutations);
				this.domObserver.observe(this.view.dom, { childList: true, subtree: true });
				this.resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(this.onResize);
				this.observeResizeTarget(this.view.scrollDOM);
				this.scheduleMeasure();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.scheduleMeasure();
				}
			}

			destroy(): void {
				this.domObserver.disconnect();
				this.resizeObserver?.disconnect();
				if (this.scrollFlushFrame !== undefined) {
					window.cancelAnimationFrame(this.scrollFlushFrame);
				}
				if (this.gestureFrameReset !== undefined) {
					window.cancelAnimationFrame(this.gestureFrameReset);
				}
				for (const target of this.observedScrollTargets) {
					target.removeEventListener('scroll', this.onScroll);
				}
				this.observedScrollTargets.clear();
				this.observedResizeTargets.clear();
			}

			private readonly onScroll = (event: Event): void => {
				if (this.syncing) {
					return;
				}
				const source = event.target;
				if (!(source instanceof HTMLElement)) {
					return;
				}
				const blockId = source.dataset.shikiBlockId;
				if (!blockId || (!source.classList.contains(SHIKI_BLOCK_SCROLL_ROW_CLASS) && !source.classList.contains(SHIKI_BLOCK_SCROLLBAR_CLASS))) {
					return;
				}
				if (!this.blockCacheById.has(blockId)) {
					this.scheduleMeasure();
					return;
				}
				if (source.classList.contains(SHIKI_BLOCK_SCROLL_ROW_CLASS)) {
					const cache = this.blockCacheById.get(blockId);
					const memoryScrollLeft = this.scrollLeftByBlock.get(stableBlockScrollMemoryKey(blockId)) ?? 0;
					const expectedScrollLeft = this.expectedScrollLeftByElement.get(source) ?? 0;
					if (source.scrollLeft === 0 && memoryScrollLeft > 0 && expectedScrollLeft > 0) {
						this.setScrollLeft(source, memoryScrollLeft);
						return;
					}
					const sourceNativeMaxScrollLeft = this.rowNativeMaxScrollLeftByElement.get(source) ?? cache?.maxScrollLeft ?? 0;
					if (source.scrollLeft === 0 && (cache?.maxScrollLeft ?? 0) > 0 && sourceNativeMaxScrollLeft <= 0) {
						const currentScrollLeft = this.blockScrollLeft(blockId);
						if (currentScrollLeft > 0) {
							this.setScrollLeft(source, currentScrollLeft);
							return;
						}
					}
					const scrollLeft = this.clampBlockScrollLeft(blockId, source.scrollLeft);
					this.setScrollLeft(source, scrollLeft);
					this.syncBlockImmediate(blockId, scrollLeft);
					return;
				}
				this.syncBlockImmediate(blockId, source.scrollLeft);
			};

			readonly onWheel = (event: WheelEvent): boolean | void => {
				const target = this.scrollTargetFromEvent(event.target, event.clientX, event.clientY);
				if (!target || this.isBlockScrollDisabled(target.blockId)) {
					return;
				}
				const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
				if (horizontalDelta === 0) {
					return;
				}
				const normalizedDelta = this.normalizeWheelDelta(horizontalDelta, event.deltaMode, target.blockId);
				this.cancelHorizontalGesture(event);
				this.applyHorizontalGestureScroll(target.blockId, target.scrollLeft + normalizedDelta, true);
				return true;
			};

			readonly onPointerDown = (event: PointerEvent): boolean | void => {
				if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
					return;
				}
				const target = this.scrollTargetFromEvent(event.target, event.clientX, event.clientY);
				if (!target || this.isBlockScrollDisabled(target.blockId)) {
					this.resetPointer();
					return;
				}
				this.pointerId = event.pointerId;
				this.pointerBlockId = target.blockId;
				this.pointerStartX = event.clientX;
				this.pointerStartY = event.clientY;
				this.pointerStartScrollLeft = target.scrollLeft;
				this.pointerHorizontal = false;
				this.pointerCaptureTarget = event.target instanceof HTMLElement ? event.target : undefined;
				try {
					this.pointerCaptureTarget?.setPointerCapture(event.pointerId);
				} catch {
					this.pointerCaptureTarget = undefined;
				}
			};

			readonly onPointerMove = (event: PointerEvent): boolean | void => {
				if (this.pointerId !== event.pointerId || !this.pointerBlockId) {
					return;
				}
				const deltaX = event.clientX - this.pointerStartX;
				const deltaY = event.clientY - this.pointerStartY;
				if (!this.pointerHorizontal && Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
					this.pointerHorizontal = true;
				}
				if (!this.pointerHorizontal && Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
					this.resetPointer();
					return;
				}
				if (!this.pointerHorizontal) {
					return;
				}
				this.cancelHorizontalGesture(event);
				this.applyHorizontalGestureScroll(this.pointerBlockId, this.pointerStartScrollLeft - deltaX, true);
				return true;
			};

			readonly onPointerEnd = (event: PointerEvent): void => {
				if (this.pointerId === event.pointerId) {
					this.flushScheduledScrolls();
					this.resetPointer();
				}
			};

			readonly onTouchStart = (event: TouchEvent): boolean | void => {
				const touch = event.changedTouches[0];
				const target = touch ? this.scrollTargetFromEvent(event.target, touch.clientX, touch.clientY) : undefined;
				if (!target || !touch || this.isBlockScrollDisabled(target.blockId)) {
					this.resetTouch();
					return;
				}
				this.touchBlockId = target.blockId;
				this.touchStartX = touch.clientX;
				this.touchStartY = touch.clientY;
				this.touchStartScrollLeft = target.scrollLeft;
				this.touchHorizontal = false;
				this.touchId = touch.identifier;
			};

			readonly onTouchMove = (event: TouchEvent): boolean | void => {
				if (!this.touchBlockId || this.touchId === undefined) {
					return;
				}
				const touch = this.findTouch(event.changedTouches, this.touchId);
				if (!touch) {
					return;
				}
				const deltaX = touch.clientX - this.touchStartX;
				const deltaY = touch.clientY - this.touchStartY;
				if (!this.touchHorizontal && Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
					this.touchHorizontal = true;
				}
				if (!this.touchHorizontal && Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
					this.resetTouch();
					return;
				}
				if (!this.touchHorizontal) {
					return;
				}
				this.cancelHorizontalGesture(event);
				this.applyHorizontalGestureScroll(this.touchBlockId, this.touchStartScrollLeft - deltaX, true);
				return true;
			};

			readonly onTouchEnd = (): void => {
				this.flushScheduledScrolls();
				this.resetTouch();
			};

			private readonly onDomMutations = (records: MutationRecord[]): void => {
				if (!records.some(record => record.addedNodes.length > 0 || record.removedNodes.length > 0)) {
					return;
				}
				this.scheduleMeasure();
			};

			private readonly onResize = (): void => {
				this.scheduleMeasure();
			};

			private syncBlock(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingScrollLeftByBlock.set(blockId, nextScrollLeft);
				this.scheduleScrollFlush();
			}

			private syncBlockImmediate(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingScrollLeftByBlock.delete(blockId);
				this.syncing = true;
				try {
					this.applyBlockScroll(blockId, nextScrollLeft);
				} finally {
					this.syncing = false;
				}
			}

			private syncGestureBlock(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				if (this.immediateGestureSyncBlockIds.has(blockId)) {
					this.pendingScrollLeftByBlock.set(blockId, nextScrollLeft);
					this.scheduleScrollFlush();
					return;
				}
				this.immediateGestureSyncBlockIds.add(blockId);
				this.scheduleGestureFrameReset();
				this.pendingScrollLeftByBlock.delete(blockId);
				this.syncing = true;
				try {
					this.applyBlockScroll(blockId, nextScrollLeft);
				} finally {
					this.syncing = false;
				}
			}

			private applyHorizontalGestureScroll(blockId: string, scrollLeft: number, immediate: boolean): void {
				const currentScrollLeft = this.clampBlockScrollLeft(blockId, this.blockScrollLeft(blockId));
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				if (nextScrollLeft === currentScrollLeft) {
					return;
				}
				if (immediate) {
					this.syncGestureBlock(blockId, nextScrollLeft);
					return;
				}
				this.syncBlock(blockId, nextScrollLeft);
			}

			private cancelHorizontalGesture(event: Event): void {
				if (event.cancelable) {
					event.preventDefault();
				}
				event.stopImmediatePropagation();
			}

			private findTouch(touches: TouchList, identifier: number): Touch | undefined {
				for (let index = 0; index < touches.length; index++) {
					const touch = touches.item(index);
					if (touch?.identifier === identifier) {
						return touch;
					}
				}
				return undefined;
			}

			private scheduleScrollFlush(): void {
				if (this.scrollFlushFrame !== undefined) {
					return;
				}
				this.scrollFlushFrame = window.requestAnimationFrame(() => {
					this.scrollFlushFrame = undefined;
					this.flushPendingScrolls();
				});
			}

			private scheduleGestureFrameReset(): void {
				if (this.gestureFrameReset !== undefined) {
					return;
				}
				this.gestureFrameReset = window.requestAnimationFrame(() => {
					this.gestureFrameReset = undefined;
					this.immediateGestureSyncBlockIds.clear();
				});
			}

			private flushPendingScrolls(): void {
				const pending = [...this.pendingScrollLeftByBlock];
				this.pendingScrollLeftByBlock.clear();
				this.syncing = true;
				try {
					for (const [blockId, scrollLeft] of pending) {
						this.applyBlockScroll(blockId, scrollLeft);
					}
				} finally {
					this.syncing = false;
				}
			}

			private applyBlockScroll(blockId: string, scrollLeft: number): void {
				const cache = this.blockCacheById.get(blockId);
				if (!cache) {
					this.scheduleMeasure();
					return;
				}
				for (const row of cache.rows) {
					this.setScrollLeft(row, scrollLeft);
				}
				for (const scrollbar of cache.scrollbars) {
					this.setScrollLeft(scrollbar, scrollLeft);
				}
			}

			private applyStoredScrolls(): void {
				for (const blockId of this.blockCacheById.keys()) {
					const scrollLeft = this.scrollLeftByBlock.get(stableBlockScrollMemoryKey(blockId));
					if (scrollLeft !== undefined) {
						this.syncBlock(blockId, scrollLeft);
					}
				}
				this.flushScheduledScrolls();
			}

			private flushScheduledScrolls(): void {
				if (this.pendingScrollLeftByBlock.size === 0) {
					return;
				}
				if (this.scrollFlushFrame !== undefined) {
					window.cancelAnimationFrame(this.scrollFlushFrame);
					this.scrollFlushFrame = undefined;
				}
				this.flushPendingScrolls();
			}

			private readonly scheduleMeasure = (): void => {
				if (this.measureScheduled) {
					return;
				}
				this.measureScheduled = true;
				this.view.requestMeasure({
					key: this,
					read: () => this.readBlockScrollMeasures(),
					write: measures => {
						this.measureScheduled = false;
						this.writeBlockScrollMeasures(measures);
						this.applyStoredScrolls();
					},
				});
			};

			private readBlockScrollMeasures(): BlockScrollMeasure[] {
				const blockIds = new Set<string>();
				for (const element of this.view.dom.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) {
						blockIds.add(blockId);
					}
				}

				const measures: BlockScrollMeasure[] = [];
				for (const blockId of blockIds) {
					const escapedBlockId = CSS.escape(blockId);
					const rows = [...this.view.dom.querySelectorAll<HTMLElement>(`.${SHIKI_BLOCK_SCROLL_ROW_CLASS}[data-shiki-block-id="${escapedBlockId}"]`)];
					const scrollbars = [
						...this.view.dom.querySelectorAll<HTMLElement>(`.${SHIKI_BLOCK_SCROLLBAR_CLASS}[data-shiki-block-id="${escapedBlockId}"]`),
					];
					if (rows.length === 0 && scrollbars.length === 0) {
						continue;
					}
					const headers = [...this.view.dom.querySelectorAll<HTMLElement>(`.shiki-live-preview-header[data-shiki-block-id="${escapedBlockId}"]`)];
					const innerScrollbars = scrollbars
						.map(scrollbar => scrollbar.querySelector<HTMLElement>(`.${SHIKI_BLOCK_SCROLLBAR_INNER_CLASS}`))
						.filter((element): element is HTMLElement => element !== null);
					const rowScrollWidths = rows.map(row => row.scrollWidth);
					const rowClientWidths = rows.map(row => row.clientWidth);
					const scrollbarClientWidths = scrollbars.map(scrollbar => scrollbar.clientWidth);
					const clipWidths = scrollbarClientWidths.filter(width => width > 0);
					const clipWidth = clipWidths.length ? Math.min(...clipWidths) : 0;
					const maxScrollWidth = Math.max(0, ...rowScrollWidths);
					const maxScrollLeft = Math.max(
						0,
						...rows.map((row, index) => Math.max(rowScrollWidths[index] ?? 0, maxScrollWidth) - (rowClientWidths[index] ?? 0)),
					);
					const disabled = scrollbars.some(scrollbar => scrollbar.dataset.shikiScrollDisabled === 'true');
					measures.push({
						blockId,
						rows,
						scrollbars,
						headers,
						innerScrollbars,
						rowScrollWidths,
						rowClientWidths,
						scrollbarClientWidths,
						maxScrollLeft,
						maxScrollWidth,
						clipWidth,
						disabled,
					});
				}
				return measures;
			}

			private writeBlockScrollMeasures(measures: BlockScrollMeasure[]): void {
				const nextBlockIds = new Set(measures.map(measure => measure.blockId));
				for (const blockId of this.blockCacheById.keys()) {
					if (!nextBlockIds.has(blockId)) {
						this.blockCacheById.delete(blockId);
					}
				}
				const nextScrollTargets = new Set<HTMLElement>();
				const nextResizeTargets = new Set<HTMLElement>([this.view.scrollDOM]);

				for (const measure of measures) {
					const cache: BlockScrollCache = {
						rows: measure.rows,
						scrollbars: measure.scrollbars,
						headers: measure.headers,
						innerScrollbars: measure.innerScrollbars,
						maxScrollLeft: measure.maxScrollLeft,
						maxScrollWidth: measure.maxScrollWidth,
						clipWidth: measure.clipWidth,
						disabled: measure.disabled,
					};
					const memoryKey = stableBlockScrollMemoryKey(measure.blockId);
					const storedScrollLeft = this.scrollLeftByBlock.get(memoryKey);
					if (storedScrollLeft !== undefined && storedScrollLeft > measure.maxScrollLeft) {
						this.scrollLeftByBlock.set(memoryKey, measure.maxScrollLeft);
					}
					this.updateRowScrollSpacers(cache);
					this.blockCacheById.set(measure.blockId, cache);
					measure.rows.forEach((row, index) => {
						const nativeMaxScrollLeft = Math.max(0, (measure.rowScrollWidths[index] ?? 0) - (measure.rowClientWidths[index] ?? 0));
						this.rowNativeMaxScrollLeftByElement.set(row, nativeMaxScrollLeft);
					});
					for (const inner of measure.innerScrollbars) {
						this.setStyleProperty(inner, 'width', `${Math.max(...measure.scrollbarClientWidths, measure.maxScrollWidth)}px`);
					}
					for (const scrollbar of measure.scrollbars) {
						scrollbar.hidden = measure.maxScrollLeft <= 0 || measure.disabled;
						if (!scrollbar.hidden && scrollbar.scrollLeft > 0) {
							this.syncBlock(measure.blockId, scrollbar.scrollLeft);
						}
					}
					this.syncClosingFenceScrollbarState(measure.blockId, measure.maxScrollLeft > 0 && !measure.disabled);
					for (const element of [...measure.rows, ...measure.scrollbars]) {
						nextScrollTargets.add(element);
					}
					for (const element of [...measure.rows, ...measure.scrollbars, ...measure.headers]) {
						nextResizeTargets.add(element);
					}
				}

				this.syncObservedScrollTargets(nextScrollTargets);
				this.syncObservedResizeTargets(nextResizeTargets);
			}

			private updateRowScrollSpacers(cache: BlockScrollCache): void {
				for (const header of cache.headers) {
					this.setStyleProperty(header, '--shiki-block-clip-width', cache.clipWidth > 0 ? `${cache.clipWidth}px` : '100%');
				}
				for (const row of cache.rows) {
					const spacerWidth = cache.disabled ? 0 : cache.maxScrollWidth;
					this.setStyleProperty(row, '--shiki-block-clip-width', cache.clipWidth > 0 ? `${cache.clipWidth}px` : '100%');
					this.setStyleProperty(row, '--shiki-block-scroll-spacer-width', `${spacerWidth}px`);
					if (cache.disabled) {
						this.setScrollLeft(row, 0);
					}
				}
			}

			private syncClosingFenceScrollbarState(blockId: string, hasVisibleScrollbar: boolean): void {
				const escapedBlockId = CSS.escape(blockId);
				for (const closingFence of this.view.dom.querySelectorAll<HTMLElement>(
					`.shiki-live-preview-closing-fence-line[data-shiki-block-id="${escapedBlockId}"]`,
				)) {
					closingFence.classList.toggle('shiki-live-preview-closing-fence-has-scrollbar', hasVisibleScrollbar);
				}
			}

			private setScrollLeft(target: HTMLElement, scrollLeft: number): void {
				this.expectedScrollLeftByElement.set(target, scrollLeft);
				if (target.scrollLeft !== scrollLeft) {
					target.scrollLeft = scrollLeft;
				}
			}

			private setStyleProperty(target: HTMLElement, property: string, value: string): void {
				if (target.style.getPropertyValue(property) !== value) {
					target.style.setProperty(property, value);
				}
			}

			private observeScrollTarget(target: HTMLElement): void {
				if (this.observedScrollTargets.has(target)) {
					return;
				}
				this.observedScrollTargets.add(target);
				target.addEventListener('scroll', this.onScroll);
			}

			private syncObservedScrollTargets(targets: Set<HTMLElement>): void {
				for (const target of this.observedScrollTargets) {
					if (!targets.has(target)) {
						target.removeEventListener('scroll', this.onScroll);
						this.observedScrollTargets.delete(target);
					}
				}
				for (const target of targets) {
					this.observeScrollTarget(target);
				}
			}

			private observeResizeTarget(target: HTMLElement): void {
				if (this.observedResizeTargets.has(target)) {
					return;
				}
				this.observedResizeTargets.add(target);
				this.resizeObserver?.observe(target);
			}

			private syncObservedResizeTargets(targets: Set<HTMLElement>): void {
				for (const target of this.observedResizeTargets) {
					if (!targets.has(target)) {
						this.resizeObserver?.unobserve(target);
						this.observedResizeTargets.delete(target);
					}
				}
				for (const target of targets) {
					this.observeResizeTarget(target);
				}
			}

			private scrollTargetFromEvent(
				target: EventTarget | null,
				_clientX?: number,
				_clientY?: number,
			): { blockId: string; scrollLeft: number } | undefined {
				const targetBlockId = this.blockIdFromElement(
					target instanceof Element ? target : target instanceof Text ? (target.parentElement ?? undefined) : undefined,
				);
				if (targetBlockId) {
					return { blockId: targetBlockId, scrollLeft: this.blockScrollLeft(targetBlockId) };
				}
				return undefined;
			}

			private blockIdFromElement(element: Element | undefined): string | undefined {
				if (!element || !this.view.dom.contains(element)) {
					return undefined;
				}
				const scrollSurface = element.closest<HTMLElement>(
					`.${SHIKI_BLOCK_SCROLL_ROW_CLASS}[data-shiki-block-id], .${SHIKI_BLOCK_SCROLLBAR_CLASS}[data-shiki-block-id]`,
				);
				const blockId = scrollSurface?.dataset.shikiBlockId;
				if (blockId) {
					const cache = this.blockCacheById.get(blockId);
					if (cache && (cache.rows.length > 0 || cache.scrollbars.length > 0)) {
						return blockId;
					}
					this.scheduleMeasure();
				}
				return undefined;
			}

			private blockScrollLeft(blockId: string): number {
				const pendingScrollLeft = this.pendingScrollLeftByBlock.get(blockId);
				if (pendingScrollLeft !== undefined) {
					return pendingScrollLeft;
				}
				const cache = this.blockCacheById.get(blockId);
				if (!cache) {
					this.scheduleMeasure();
					return this.scrollLeftByBlock.get(stableBlockScrollMemoryKey(blockId)) ?? 0;
				}
				return Math.max(
					0,
					...cache.rows.map(row => row.scrollLeft),
					...cache.scrollbars.map(scrollbar => scrollbar.scrollLeft),
					this.scrollLeftByBlock.get(stableBlockScrollMemoryKey(blockId)) ?? 0,
				);
			}

			private clampBlockScrollLeft(blockId: string, scrollLeft: number): number {
				return Math.max(0, Math.min(scrollLeft, this.maxBlockScrollLeft(blockId)));
			}

			private maxBlockScrollLeft(blockId: string): number {
				const cache = this.blockCacheById.get(blockId);
				if (!cache) {
					this.scheduleMeasure();
					return 0;
				}
				return cache.maxScrollLeft;
			}

			private normalizeWheelDelta(delta: number, deltaMode: number, blockId: string): number {
				if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
					return delta * 16;
				}
				if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
					return delta * (this.blockCacheById.get(blockId)?.clipWidth ?? 1);
				}
				return delta;
			}

			private rowsForBlock(blockId: string): HTMLElement[] {
				return this.blockCacheById.get(blockId)?.rows ?? [];
			}

			private scrollbarsForBlock(blockId: string): HTMLElement[] {
				return this.blockCacheById.get(blockId)?.scrollbars ?? [];
			}

			private isBlockScrollDisabled(blockId: string): boolean {
				return this.blockCacheById.get(blockId)?.disabled ?? true;
			}

			private resetTouch(): void {
				this.touchBlockId = undefined;
				this.touchHorizontal = false;
				this.touchId = undefined;
			}

			private resetPointer(): void {
				if (this.pointerId !== undefined) {
					try {
						this.pointerCaptureTarget?.releasePointerCapture(this.pointerId);
					} catch {
						// Pointer capture may already be released by the renderer.
					}
				}
				this.pointerId = undefined;
				this.pointerBlockId = undefined;
				this.pointerCaptureTarget = undefined;
				this.pointerHorizontal = false;
			}
		},
		{
			eventHandlers: {
				wheel(event) {
					return this.onWheel(event);
				},
				pointerdown(event) {
					return this.onPointerDown(event);
				},
				pointermove(event) {
					return this.onPointerMove(event);
				},
				pointerup(event) {
					this.onPointerEnd(event);
				},
				pointercancel(event) {
					this.onPointerEnd(event);
				},
				touchstart(event) {
					return this.onTouchStart(event);
				},
				touchmove(event) {
					return this.onTouchMove(event);
				},
				touchend() {
					this.onTouchEnd();
				},
				touchcancel() {
					this.onTouchEnd();
				},
			},
		},
	);
}
