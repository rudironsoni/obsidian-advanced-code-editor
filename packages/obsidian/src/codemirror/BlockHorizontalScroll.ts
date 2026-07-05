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
			private measureTimer: number | undefined;
			private readonly observedScrollTargets = new Set<HTMLElement>();
			private readonly domObserver: MutationObserver;
			private readonly blockCacheById = new Map<string, BlockScrollCache>();
			private readonly pendingScrollLeftByBlock = new Map<string, number>();
			private readonly gestureRoot: EventTarget;
			private scrollFlushFrame: number | undefined;

			constructor(private readonly view: EditorView) {
				this.gestureRoot = this.view.root as unknown as EventTarget;
				this.domObserver = new MutationObserver(this.onDomMutations);
				this.view.scrollDOM.addEventListener('scroll', this.onScroll, true);
				this.view.scrollDOM.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
				this.gestureRoot.addEventListener('pointerdown', this.onPointerDown as EventListener, true);
				this.gestureRoot.addEventListener('pointermove', this.onPointerMove as EventListener, true);
				this.gestureRoot.addEventListener('pointerup', this.onPointerEnd as EventListener, true);
				this.gestureRoot.addEventListener('pointercancel', this.onPointerEnd as EventListener, true);
				this.gestureRoot.addEventListener('touchstart', this.onTouchStart as EventListener, { capture: true, passive: false });
				this.gestureRoot.addEventListener('touchmove', this.onTouchMove as EventListener, { capture: true, passive: false });
				this.gestureRoot.addEventListener('touchend', this.onTouchEnd, true);
				this.gestureRoot.addEventListener('touchcancel', this.onTouchEnd, true);
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
				this.gestureRoot.removeEventListener('pointerdown', this.onPointerDown as EventListener, true);
				this.gestureRoot.removeEventListener('pointermove', this.onPointerMove as EventListener, true);
				this.gestureRoot.removeEventListener('pointerup', this.onPointerEnd as EventListener, true);
				this.gestureRoot.removeEventListener('pointercancel', this.onPointerEnd as EventListener, true);
				this.gestureRoot.removeEventListener('touchstart', this.onTouchStart as EventListener, true);
				this.gestureRoot.removeEventListener('touchmove', this.onTouchMove as EventListener, true);
				this.gestureRoot.removeEventListener('touchend', this.onTouchEnd, true);
				this.gestureRoot.removeEventListener('touchcancel', this.onTouchEnd, true);
				if (this.measureTimer !== undefined) {
					window.clearTimeout(this.measureTimer);
				}
				if (this.scrollFlushFrame !== undefined) {
					window.cancelAnimationFrame(this.scrollFlushFrame);
				}
				for (const target of this.observedScrollTargets) {
					target.removeEventListener('scroll', this.onScroll);
					target.removeEventListener('wheel', this.onWheel, true);
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
					const scrollLeft = this.clampBlockScrollLeft(blockId, source.scrollLeft);
					this.setScrollLeft(source, scrollLeft);
					this.syncBlockImmediate(blockId, scrollLeft);
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
				this.pointerCaptureTarget = event.target instanceof HTMLElement ? event.target : undefined;
				try {
					this.pointerCaptureTarget?.setPointerCapture(event.pointerId);
				} catch {
					this.pointerCaptureTarget = undefined;
				}
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
				if (!this.pointerHorizontal && Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
					this.resetPointer();
					return;
				}
				if (!this.pointerHorizontal) {
					return;
				}
				this.cancelHorizontalGesture(event);
				event.stopPropagation();
				this.syncBlockImmediate(this.pointerBlockId, this.pointerStartScrollLeft - deltaX);
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
				this.touchId = touch.identifier;
			};

			private readonly onTouchMove = (event: TouchEvent): void => {
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
				event.stopPropagation();
				this.syncBlockImmediate(this.touchBlockId, this.touchStartScrollLeft - deltaX);
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
				const headers = [...this.view.dom.querySelectorAll<HTMLElement>(`.shiki-live-preview-header[data-shiki-block-id="${escapedBlockId}"]`)];
				const clipWidths = scrollbars.map(element => element.clientWidth).filter(width => width > 0);
				const clipWidth = clipWidths.length ? Math.min(...clipWidths) : 0;
				const naturalScrollWidths: number[] = [];
				for (const row of rows) {
					this.setStyleProperty(row, '--shiki-block-scroll-spacer-width', '0px');
					this.setStyleProperty(row, '--shiki-block-clip-width', clipWidth > 0 ? `${clipWidth}px` : '100%');
					const naturalScrollWidth = row.scrollWidth;
					naturalScrollWidths.push(naturalScrollWidth);
				}
				const maxScrollWidth = Math.max(0, ...naturalScrollWidths);
				const maxScrollLeft = Math.max(0, ...rows.map(row => Math.max(row.scrollWidth, maxScrollWidth) - row.clientWidth));
				const disabled = scrollbars.some(scrollbar => scrollbar.dataset.shikiScrollDisabled === 'true');
				const cache = { rows, scrollbars, headers, maxScrollLeft, maxScrollWidth, clipWidth, disabled };
				this.updateRowScrollSpacers(cache);
				this.blockCacheById.set(blockId, cache);
				return cache;
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
					const cache = this.cacheForBlock(blockId);
					if (cache.rows.length > 0 || cache.scrollbars.length > 0) {
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
	);
}
