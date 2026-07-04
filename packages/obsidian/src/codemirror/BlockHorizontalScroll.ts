import type { Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from '@codemirror/view';

export const SHIKI_BLOCK_SCROLL_ROW_CLASS = 'shiki-block-scroll-row';
export const SHIKI_BLOCK_SCROLLBAR_CLASS = 'shiki-block-horizontal-scrollbar';
export const SHIKI_BLOCK_SCROLLBAR_INNER_CLASS = 'shiki-block-horizontal-scrollbar-inner';

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

export function stableBlockScrollMemoryKey(blockId: string): string {
	const parts = blockId.split('::');
	return parts.length > 1 ? parts.slice(0, -1).join('::') : blockId;
}

interface BlockScrollCache {
	rows: HTMLElement[];
	scrollbars: HTMLElement[];
	maxScrollLeft: number;
	maxScrollWidth: number;
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
			private pointerId: number | undefined;
			private pointerBlockId: string | undefined;
			private pointerStartX = 0;
			private pointerStartY = 0;
			private pointerStartScrollLeft = 0;
			private pointerHorizontal = false;
			private measureTimer: number | undefined;
			private readonly observedScrollTargets = new Set<HTMLElement>();
			private readonly domObserver: MutationObserver;
			private readonly blockCacheById = new Map<string, BlockScrollCache>();
			private readonly pendingScrollLeftByBlock = new Map<string, number>();
			private scrollFlushFrame: number | undefined;

			constructor(private readonly view: EditorView) {
				this.domObserver = new MutationObserver(this.onDomMutations);
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
				this.domObserver.observe(this.view.dom, { childList: true, subtree: true });
				this.scheduleMeasure();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.applyStoredScrolls();
					this.rescheduleMeasure();
				}
			}

			destroy(): void {
				this.domObserver.disconnect();
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
				if (this.measureTimer !== undefined) {
					window.clearTimeout(this.measureTimer);
				}
				if (this.scrollFlushFrame !== undefined) {
					window.cancelAnimationFrame(this.scrollFlushFrame);
				}
				for (const target of this.observedScrollTargets) {
					target.removeEventListener('scroll', this.onScroll);
					target.removeEventListener('wheel', this.onWheel, true);
					target.removeEventListener('pointerdown', this.onPointerDown, true);
					target.removeEventListener('pointermove', this.onPointerMove, true);
					target.removeEventListener('pointerup', this.onPointerEnd, true);
					target.removeEventListener('pointercancel', this.onPointerEnd, true);
					target.removeEventListener('touchstart', this.onTouchStart, true);
					target.removeEventListener('touchmove', this.onTouchMove, true);
					target.removeEventListener('touchend', this.onTouchEnd, true);
					target.removeEventListener('touchcancel', this.onTouchEnd, true);
				}
				this.observedScrollTargets.clear();
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
				if (source.classList.contains(SHIKI_BLOCK_SCROLL_ROW_CLASS)) {
					return;
				}
				this.syncBlock(blockId, source.scrollLeft);
			};

			private readonly onWheel = (event: WheelEvent): void => {
				const target = this.scrollTargetFromEvent(event.target, event.clientX, event.clientY);
				if (!target || this.isBlockScrollDisabled(target.blockId)) {
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
				this.syncBlock(target.blockId, nextScrollLeft);
			};

			private readonly onPointerDown = (event: PointerEvent): void => {
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
				this.syncBlock(this.pointerBlockId, this.pointerStartScrollLeft - deltaX);
			};

			private readonly onPointerEnd = (event: PointerEvent): void => {
				if (this.pointerId === event.pointerId) {
					this.resetPointer();
				}
			};

			private readonly onTouchStart = (event: TouchEvent): void => {
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
				this.syncBlock(this.touchBlockId, this.touchStartScrollLeft - deltaX);
			};

			private readonly onTouchEnd = (): void => {
				this.resetTouch();
			};

			private readonly onDomMutations = (records: MutationRecord[]): void => {
				if (!records.some(record => record.addedNodes.length > 0 || record.removedNodes.length > 0)) {
					return;
				}
				this.applyStoredScrolls();
				this.scheduleMeasure();
			};

			private syncBlock(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingScrollLeftByBlock.set(blockId, nextScrollLeft);
				this.scheduleScrollFlush();
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
				const cache = this.cacheForBlock(blockId);
				this.updateRowScrollSpacers(cache);
				for (const row of cache.rows) {
					this.setScrollLeft(row, scrollLeft);
				}
				for (const scrollbar of cache.scrollbars) {
					this.setScrollLeft(scrollbar, scrollLeft);
				}
			}

			private applyStoredScrolls(): void {
				const blockIds = new Set<string>();
				for (const element of this.view.dom.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) {
						blockIds.add(blockId);
					}
				}
				for (const blockId of blockIds) {
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
				if (this.measureTimer !== undefined) {
					return;
				}
				this.measureTimer = window.setTimeout(() => {
					this.measureTimer = undefined;
					this.measureScrollbars();
					this.applyStoredScrolls();
				}, 0);
			};

			private rescheduleMeasure(): void {
				if (this.measureTimer !== undefined) {
					window.clearTimeout(this.measureTimer);
					this.measureTimer = undefined;
				}
				this.scheduleMeasure();
			}

			private measureScrollbars(): void {
				this.blockCacheById.clear();
				for (const scrollbar of this.view.dom.querySelectorAll<HTMLElement>(`.${SHIKI_BLOCK_SCROLLBAR_CLASS}[data-shiki-block-id]`)) {
					const blockId = scrollbar.dataset.shikiBlockId;
					if (!blockId) {
						continue;
					}
					const cache = this.refreshBlockCache(blockId);
					this.observeScrollTarget(scrollbar);
					for (const row of cache.rows) {
						this.observeScrollTarget(row);
					}
					const inner = scrollbar.querySelector<HTMLElement>(`.${SHIKI_BLOCK_SCROLLBAR_INNER_CLASS}`);
					if (inner) {
						this.setStyleProperty(inner, 'width', `${Math.max(scrollbar.clientWidth, cache.maxScrollWidth)}px`);
					}
					scrollbar.hidden = cache.maxScrollLeft <= 0 || cache.disabled;
					if (!scrollbar.hidden && scrollbar.scrollLeft > 0) {
						this.syncBlock(blockId, scrollbar.scrollLeft);
					}
				}
			}

			private cacheForBlock(blockId: string): BlockScrollCache {
				return this.blockCacheById.get(blockId) ?? this.refreshBlockCache(blockId);
			}

			private refreshBlockCache(blockId: string): BlockScrollCache {
				const escapedBlockId = CSS.escape(blockId);
				const rows = [...this.view.dom.querySelectorAll<HTMLElement>(`.${SHIKI_BLOCK_SCROLL_ROW_CLASS}[data-shiki-block-id="${escapedBlockId}"]`)];
				const scrollbars = [...this.view.dom.querySelectorAll<HTMLElement>(`.${SHIKI_BLOCK_SCROLLBAR_CLASS}[data-shiki-block-id="${escapedBlockId}"]`)];
				const naturalScrollWidths: number[] = [];
				for (const row of rows) {
					this.setStyleProperty(row, '--shiki-block-scroll-spacer-width', '0px');
					this.setStyleProperty(row, '--shiki-block-scroll-width', 'auto');
					naturalScrollWidths.push(
						Math.max(
							row.scrollWidth,
							...Array.from(row.querySelectorAll<HTMLElement>('.shiki-live-preview-code-content')).map(element => element.scrollWidth),
						),
					);
				}
				const maxScrollWidth = Math.max(0, ...naturalScrollWidths);
				const maxScrollLeft = Math.max(0, ...rows.map(row => Math.max(row.scrollWidth, maxScrollWidth) - row.clientWidth));
				const disabled = scrollbars.some(scrollbar => scrollbar.dataset.shikiScrollDisabled === 'true');
				const cache = { rows, scrollbars, maxScrollLeft, maxScrollWidth, disabled };
				this.updateRowScrollSpacers(cache);
				this.blockCacheById.set(blockId, cache);
				return cache;
			}

			private updateRowScrollSpacers(cache: BlockScrollCache): void {
				for (const row of cache.rows) {
					const spacerWidth = cache.disabled ? 0 : cache.maxScrollWidth + row.clientWidth;
					this.setStyleProperty(row, '--shiki-block-scroll-spacer-width', `${spacerWidth}px`);
					this.setStyleProperty(row, '--shiki-block-scroll-width', cache.disabled ? 'auto' : `${cache.maxScrollWidth}px`);
					if (cache.disabled) {
						this.setScrollLeft(row, 0);
					}
				}
			}

			private setScrollLeft(target: HTMLElement, scrollLeft: number): void {
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
				target.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
				target.addEventListener('pointerdown', this.onPointerDown, true);
				target.addEventListener('pointermove', this.onPointerMove, true);
				target.addEventListener('pointerup', this.onPointerEnd, true);
				target.addEventListener('pointercancel', this.onPointerEnd, true);
				target.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: false });
				target.addEventListener('touchmove', this.onTouchMove, { capture: true, passive: false });
				target.addEventListener('touchend', this.onTouchEnd, true);
				target.addEventListener('touchcancel', this.onTouchEnd, true);
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
				if (blockId) {
					const cache = this.cacheForBlock(blockId);
					if (cache.rows.length > 0 || cache.scrollbars.length > 0) {
						return blockId;
					}
				}
				return undefined;
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
					const rects = elements.map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
					if (rects.length === 0 || this.cacheForBlock(blockId).rows.length === 0) {
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

			private blockScrollLeft(blockId: string): number {
				return Math.max(
					0,
					...this.cacheForBlock(blockId).rows.map(row => row.scrollLeft),
					...this.cacheForBlock(blockId).scrollbars.map(scrollbar => scrollbar.scrollLeft),
					this.scrollLeftByBlock.get(stableBlockScrollMemoryKey(blockId)) ?? 0,
				);
			}

			private clampBlockScrollLeft(blockId: string, scrollLeft: number): number {
				return Math.max(0, Math.min(scrollLeft, this.maxBlockScrollLeft(blockId)));
			}

			private maxBlockScrollLeft(blockId: string): number {
				return this.cacheForBlock(blockId).maxScrollLeft;
			}

			private normalizeWheelDelta(delta: number, deltaMode: number, blockId: string): number {
				if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
					return delta * 16;
				}
				if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
					return delta * (this.cacheForBlock(blockId).rows[0]?.clientWidth ?? 1);
				}
				return delta;
			}

			private rowsForBlock(blockId: string): HTMLElement[] {
				return this.cacheForBlock(blockId).rows;
			}

			private scrollbarsForBlock(blockId: string): HTMLElement[] {
				return this.cacheForBlock(blockId).scrollbars;
			}

			private isBlockScrollDisabled(blockId: string): boolean {
				return this.cacheForBlock(blockId).disabled;
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
		},
	);
}
