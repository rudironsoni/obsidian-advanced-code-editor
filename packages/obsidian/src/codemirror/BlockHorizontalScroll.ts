import type { Extension } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type EditorView, type ViewUpdate } from '@codemirror/view';

export const SHIKI_BLOCK_SCROLL_ROW_CLASS = 'shiki-block-scroll-row';
export const SHIKI_BLOCK_SCROLLBAR_CLASS = 'shiki-block-horizontal-scrollbar';
export const SHIKI_BLOCK_SCROLLBAR_INNER_CLASS = 'shiki-block-horizontal-scrollbar-inner';
export const SHIKI_BLOCK_SCROLL_SPACER_CLASS = 'shiki-block-scroll-spacer';
export const SHIKI_BLOCK_VISUAL_SCROLL_ROW_CLASS = 'shiki-block-visual-scroll-row';

const SHIKI_BLOCK_VISUAL_SCROLL_OFFSET = '--shiki-block-visual-scroll-offset';

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

interface ActiveVisualScroll {
	blockId: string;
	source: HTMLElement;
	rows: HTMLElement[];
	baselineScrollLeft: number;
	effectiveScrollLeft: number;
}

export function createBlockHorizontalScrollPlugin(): Extension {
	return ViewPlugin.fromClass(
		class BlockHorizontalScrollPlugin {
			private gestureInput: 'pointer' | 'touch' | undefined;
			private activeVisualScroll: ActiveVisualScroll | undefined;
			private readonly scrollLeftByBlock = new Map<string, number>();
			private syncing = false;
			private touchBlockId: string | undefined;
			private touchStartX = 0;
			private touchStartY = 0;
			private touchStartScrollLeft = 0;
			private touchSource: HTMLElement | undefined;
			private touchHorizontal = false;
			private touchId: number | undefined;
			private pointerId: number | undefined;
			private pointerBlockId: string | undefined;
			private pointerStartX = 0;
			private pointerStartY = 0;
			private pointerStartScrollLeft = 0;
			private pointerSource: HTMLElement | undefined;
			private pointerHorizontal = false;
			private readonly resizeObserver: ResizeObserver | undefined;
			private readonly observedScrollTargets = new Set<HTMLElement>();
			private readonly observedResizeTargets = new Set<HTMLElement>();
			private readonly domObserver: MutationObserver;
			private readonly blockCacheById = new Map<string, BlockScrollCache>();
			private readonly rowNativeMaxScrollLeftByElement = new WeakMap<HTMLElement, number>();
			private readonly expectedScrollLeftByElement = new WeakMap<HTMLElement, number>();
			private readonly pendingScrollLeftByBlock = new Map<string, number>();
			private readonly pendingNativeSourceByBlock = new Map<string, HTMLElement>();
			private readonly immediateWheelSyncBlockIds = new Set<string>();
			private scrollFlushFrame: number | undefined;
			private gestureFrameReset: number | undefined;
			private nativeFollowFrame: number | undefined;
			private nativeSettleFrame: number | undefined;
			private measureScheduled = false;

			constructor(private readonly view: EditorView) {
				this.domObserver = new MutationObserver(this.onDomMutations);
				this.domObserver.observe(this.view.dom, { childList: true, subtree: true });
				this.resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(this.onResize);
				this.observeResizeTarget(this.view.scrollDOM);
				this.scheduleMeasure();
			}

			update(update: ViewUpdate): void {
				if (update.docChanged) {
					this.cancelNativeSettle();
					this.finishActiveVisualScroll();
				}
				if (update.docChanged || update.viewportChanged || update.geometryChanged) {
					this.scheduleMeasure();
				}
			}

			destroy(): void {
				this.clearActiveVisualScroll();
				this.domObserver.disconnect();
				this.resizeObserver?.disconnect();
				if (this.scrollFlushFrame !== undefined) {
					window.cancelAnimationFrame(this.scrollFlushFrame);
				}
				if (this.gestureFrameReset !== undefined) {
					window.cancelAnimationFrame(this.gestureFrameReset);
				}
				this.cancelNativeFollow();
				if (this.nativeSettleFrame !== undefined) {
					window.cancelAnimationFrame(this.nativeSettleFrame);
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
					if (this.activeVisualScroll?.blockId === blockId) {
						if (this.activeVisualScroll.source === source) {
							this.updateActiveVisualScroll(this.clampBlockScrollLeft(blockId, source.scrollLeft));
						}
						return;
					}
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
					if (Math.abs(source.scrollLeft - expectedScrollLeft) <= 1) {
						return;
					}
					const scrollLeft = this.clampBlockScrollLeft(blockId, source.scrollLeft);
					this.expectedScrollLeftByElement.set(source, scrollLeft);
					this.syncNativeRow(blockId, scrollLeft, source);
					return;
				}
				const expectedScrollLeft = this.expectedScrollLeftByElement.get(source);
				if (expectedScrollLeft !== undefined && Math.abs(source.scrollLeft - expectedScrollLeft) <= 1) {
					return;
				}
				this.syncBlockImmediate(blockId, source.scrollLeft);
			};

			readonly onWheel = (event: WheelEvent): boolean | void => {
				this.cancelNativeSettle();
				this.finishActiveVisualScroll();
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
				this.applyHorizontalGestureScroll(target.blockId, this.blockScrollLeft(target.blockId) + normalizedDelta, true);
				return true;
			};

			readonly onPointerDown = (event: PointerEvent): boolean | void => {
				if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
					return;
				}
				if (this.gestureInput === 'touch') {
					return;
				}
				this.cancelNativeSettle();
				this.finishActiveVisualScroll();
				const target = this.scrollTargetFromEvent(event.target, event.clientX, event.clientY);
				if (!target || this.isBlockScrollDisabled(target.blockId)) {
					this.resetPointer();
					return;
				}
				this.resetTouch();
				this.gestureInput = 'pointer';
				this.pointerId = event.pointerId;
				this.pointerBlockId = target.blockId;
				this.pointerStartX = event.clientX;
				this.pointerStartY = event.clientY;
				this.pointerStartScrollLeft = target.surface.scrollLeft;
				this.pointerSource = target.surface;
				this.pointerHorizontal = false;
				this.beginActiveVisualScroll(target.blockId, target.surface, target.surface.scrollLeft);
			};

			readonly onPointerMove = (event: PointerEvent): void => {
				if (this.gestureInput !== 'pointer' || this.pointerId !== event.pointerId || !this.pointerBlockId) {
					return;
				}
				const deltaX = event.clientX - this.pointerStartX;
				const deltaY = event.clientY - this.pointerStartY;
				if (!this.pointerHorizontal && Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
					this.pointerHorizontal = true;
				}
				if (!this.pointerHorizontal && Math.abs(deltaY) > 6 && Math.abs(deltaY) > Math.abs(deltaX)) {
					this.resetPointer();
					this.finishActiveVisualScroll();
					return;
				}
				if (!this.pointerHorizontal) {
					return;
				}
				this.syncNativeGesturePrediction(this.pointerBlockId, this.pointerStartScrollLeft - deltaX, this.pointerStartScrollLeft, this.pointerSource);
				this.containNativeHorizontalGesture(event);
			};

			readonly onPointerEnd = (event: PointerEvent): void => {
				if (this.pointerId === event.pointerId) {
					const blockId = this.pointerBlockId;
					const source = this.pointerSource;
					const horizontal = this.pointerHorizontal;
					this.resetPointer();
					if (horizontal && blockId && source) this.scheduleNativeSettle(blockId, source);
					else this.finishActiveVisualScroll();
				}
			};

			readonly onTouchStart = (event: TouchEvent): boolean | void => {
				if (this.gestureInput === 'touch') {
					return;
				}
				this.cancelNativeSettle();
				this.finishActiveVisualScroll();
				const touch = event.changedTouches[0];
				const target = touch ? this.scrollTargetFromEvent(event.target, touch.clientX, touch.clientY) : undefined;
				if (!target || !touch || this.isBlockScrollDisabled(target.blockId)) {
					this.resetTouch();
					return;
				}
				this.resetPointer();
				this.touchBlockId = target.blockId;
				this.gestureInput = 'touch';
				this.touchStartX = touch.clientX;
				this.touchStartY = touch.clientY;
				this.touchStartScrollLeft = target.surface.scrollLeft;
				this.touchSource = target.surface;
				this.touchHorizontal = false;
				this.touchId = touch.identifier;
				this.beginActiveVisualScroll(target.blockId, target.surface, target.surface.scrollLeft);
			};

			readonly onTouchMove = (event: TouchEvent): void => {
				if (event.touches.length > 1) {
					this.resetTouch();
					this.finishActiveVisualScroll();
					return;
				}
				if (this.gestureInput !== 'touch' || !this.touchBlockId || this.touchId === undefined) {
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
					this.finishActiveVisualScroll();
					return;
				}
				if (!this.touchHorizontal) {
					return;
				}
				this.syncNativeGesturePrediction(this.touchBlockId, this.touchStartScrollLeft - deltaX, this.touchStartScrollLeft, this.touchSource);
				this.containNativeHorizontalGesture(event);
			};

			readonly onTouchEnd = (event: TouchEvent): void => {
				if (this.touchId === undefined || !this.findTouch(event.changedTouches, this.touchId)) {
					return;
				}
				const blockId = this.touchBlockId;
				const source = this.touchSource;
				const horizontal = this.touchHorizontal;
				this.resetTouch();
				if (horizontal && blockId && source) this.scheduleNativeSettle(blockId, source);
				else this.finishActiveVisualScroll();
			};

			private readonly onDomMutations = (records: MutationRecord[]): void => {
				if (!records.some(record => record.addedNodes.length > 0 || record.removedNodes.length > 0)) {
					return;
				}
				if (this.activeVisualScroll && !this.activeVisualScroll.source.isConnected) {
					this.cancelNativeSettle();
					this.clearActiveVisualScroll();
				}
				this.scheduleMeasure();
			};

			private readonly onResize = (): void => {
				this.scheduleMeasure();
			};

			private syncBlock(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingNativeSourceByBlock.delete(blockId);
				this.pendingScrollLeftByBlock.set(blockId, nextScrollLeft);
				this.scheduleScrollFlush();
			}

			private syncNativeRow(blockId: string, scrollLeft: number, source: HTMLElement): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingNativeSourceByBlock.set(blockId, source);
				this.pendingScrollLeftByBlock.set(blockId, nextScrollLeft);
				this.scheduleScrollFlush();
			}

			private syncNativeGesturePrediction(blockId: string, scrollLeft: number, baselineScrollLeft: number, source: HTMLElement | undefined): void {
				if (!source) return;
				const sourceNativeMaxScrollLeft = this.rowNativeMaxScrollLeftByElement.get(source) ?? this.maxBlockScrollLeft(blockId);
				const predictedScrollLeft = Math.min(this.clampBlockScrollLeft(blockId, scrollLeft), sourceNativeMaxScrollLeft);
				const clampedBaselineScrollLeft = this.clampBlockScrollLeft(blockId, baselineScrollLeft);
				const nativeScrollLeft = this.clampBlockScrollLeft(blockId, source.scrollLeft);
				const nativeDelta = nativeScrollLeft - clampedBaselineScrollLeft;
				const nextScrollLeft = Math.abs(nativeDelta) > 1 ? nativeScrollLeft : predictedScrollLeft;
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingScrollLeftByBlock.delete(blockId);
				this.pendingNativeSourceByBlock.delete(blockId);
				this.beginActiveVisualScroll(blockId, source, baselineScrollLeft);
				this.updateActiveVisualScroll(nextScrollLeft);
			}

			private beginActiveVisualScroll(blockId: string, source: HTMLElement, baselineScrollLeft: number): void {
				if (this.activeVisualScroll?.blockId === blockId && this.activeVisualScroll.source === source) return;
				this.finishActiveVisualScroll();
				const cache = this.blockCacheById.get(blockId);
				if (!cache) return;
				this.pendingScrollLeftByBlock.delete(blockId);
				this.pendingNativeSourceByBlock.delete(blockId);
				const clampedBaselineScrollLeft = this.clampBlockScrollLeft(blockId, baselineScrollLeft);
				this.activeVisualScroll = {
					blockId,
					source,
					rows: cache.rows.filter(row => row.isConnected),
					baselineScrollLeft: clampedBaselineScrollLeft,
					effectiveScrollLeft: clampedBaselineScrollLeft,
				};
				this.refreshActiveVisualRows(cache.rows);
				this.setStyleProperty(this.view.dom, SHIKI_BLOCK_VISUAL_SCROLL_OFFSET, '0px');
				this.scheduleNativeFollow();
			}

			private scheduleNativeFollow(): void {
				if (this.nativeFollowFrame !== undefined) return;
				const follow = (): void => {
					const active = this.activeVisualScroll;
					if (!active?.source.isConnected) {
						this.nativeFollowFrame = undefined;
						return;
					}
					const nativeScrollLeft = this.clampBlockScrollLeft(active.blockId, active.source.scrollLeft);
					const nativeDelta = nativeScrollLeft - active.baselineScrollLeft;
					const effectiveDelta = active.effectiveScrollLeft - active.baselineScrollLeft;
					if (Math.sign(nativeDelta) === Math.sign(effectiveDelta) && Math.abs(nativeDelta) > Math.abs(effectiveDelta)) {
						this.updateActiveVisualScroll(nativeScrollLeft);
					}
					this.nativeFollowFrame = window.requestAnimationFrame(follow);
				};
				this.nativeFollowFrame = window.requestAnimationFrame(follow);
			}

			private cancelNativeFollow(): void {
				if (this.nativeFollowFrame === undefined) return;
				window.cancelAnimationFrame(this.nativeFollowFrame);
				this.nativeFollowFrame = undefined;
			}

			private refreshActiveVisualRows(rows: HTMLElement[]): void {
				const active = this.activeVisualScroll;
				if (!active) return;
				for (const row of active.rows) {
					row.classList.remove(SHIKI_BLOCK_VISUAL_SCROLL_ROW_CLASS);
				}
				active.rows = rows.filter(row => row.isConnected);
				for (const row of active.rows) {
					row.classList.toggle(SHIKI_BLOCK_VISUAL_SCROLL_ROW_CLASS, row !== active.source);
				}
			}

			private updateActiveVisualScroll(scrollLeft: number): void {
				const active = this.activeVisualScroll;
				if (!active) return;
				const nextScrollLeft = this.clampBlockScrollLeft(active.blockId, scrollLeft);
				active.effectiveScrollLeft = nextScrollLeft;
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(active.blockId), nextScrollLeft);
				const visualDelta = nextScrollLeft - active.baselineScrollLeft;
				this.setStyleProperty(this.view.dom, SHIKI_BLOCK_VISUAL_SCROLL_OFFSET, `${-visualDelta}px`);
			}

			private finishActiveVisualScroll(scrollLeft?: number): void {
				const active = this.activeVisualScroll;
				if (!active) return;
				const finalScrollLeft = this.clampBlockScrollLeft(active.blockId, scrollLeft ?? active.source.scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(active.blockId), finalScrollLeft);
				this.syncing = true;
				try {
					this.applyBlockScroll(active.blockId, finalScrollLeft);
				} finally {
					this.syncing = false;
				}
				this.clearActiveVisualScroll();
			}

			private clearActiveVisualScroll(): void {
				this.cancelNativeFollow();
				const active = this.activeVisualScroll;
				if (active) {
					for (const row of active.rows) {
						row.classList.remove(SHIKI_BLOCK_VISUAL_SCROLL_ROW_CLASS);
					}
				}
				this.activeVisualScroll = undefined;
				this.view.dom.style.removeProperty(SHIKI_BLOCK_VISUAL_SCROLL_OFFSET);
			}

			private scheduleNativeSettle(blockId: string, source: HTMLElement): void {
				this.cancelNativeFollow();
				this.cancelNativeSettle();
				const startingScrollLeft = this.clampBlockScrollLeft(blockId, source.scrollLeft);
				let previousScrollLeft = startingScrollLeft;
				let sawNativeMovement =
					this.activeVisualScroll?.blockId === blockId && Math.abs(startingScrollLeft - this.activeVisualScroll.baselineScrollLeft) > 1;
				let stableFrames = 0;
				let remainingFrames = 45;
				const settle = (): void => {
					const scrollLeft = this.clampBlockScrollLeft(blockId, source.scrollLeft);
					sawNativeMovement ||= Math.abs(scrollLeft - startingScrollLeft) > 1;
					if (sawNativeMovement) {
						this.updateActiveVisualScroll(scrollLeft);
						stableFrames = Math.abs(scrollLeft - previousScrollLeft) <= 1 ? stableFrames + 1 : 0;
					}
					previousScrollLeft = scrollLeft;
					remainingFrames--;
					if (stableFrames >= 3 || remainingFrames <= 0 || !source.isConnected) {
						this.nativeSettleFrame = undefined;
						if (source.isConnected) this.finishActiveVisualScroll(scrollLeft);
						else this.clearActiveVisualScroll();
						return;
					}
					this.nativeSettleFrame = window.requestAnimationFrame(settle);
				};
				this.nativeSettleFrame = window.requestAnimationFrame(settle);
			}

			private cancelNativeSettle(): void {
				if (this.nativeSettleFrame === undefined) return;
				window.cancelAnimationFrame(this.nativeSettleFrame);
				this.nativeSettleFrame = undefined;
			}

			private syncBlockImmediate(blockId: string, scrollLeft: number): void {
				const nextScrollLeft = this.clampBlockScrollLeft(blockId, scrollLeft);
				this.scrollLeftByBlock.set(stableBlockScrollMemoryKey(blockId), nextScrollLeft);
				this.pendingScrollLeftByBlock.delete(blockId);
				this.pendingNativeSourceByBlock.delete(blockId);
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
				this.pendingNativeSourceByBlock.delete(blockId);
				if (this.immediateWheelSyncBlockIds.has(blockId)) {
					this.pendingScrollLeftByBlock.set(blockId, nextScrollLeft);
					this.scheduleScrollFlush();
					return;
				}
				this.immediateWheelSyncBlockIds.add(blockId);
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

			private containNativeHorizontalGesture(event: Event): void {
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
					this.immediateWheelSyncBlockIds.clear();
				});
			}

			private flushPendingScrolls(): void {
				const pending = [...this.pendingScrollLeftByBlock];
				this.pendingScrollLeftByBlock.clear();
				this.syncing = true;
				try {
					for (const [blockId, scrollLeft] of pending) {
						const nativeSource = this.pendingNativeSourceByBlock.get(blockId);
						this.pendingNativeSourceByBlock.delete(blockId);
						this.applyBlockScroll(blockId, scrollLeft, nativeSource);
					}
				} finally {
					this.syncing = false;
				}
			}

			private applyBlockScroll(blockId: string, scrollLeft: number, nativeSource?: HTMLElement): void {
				const cache = this.blockCacheById.get(blockId);
				if (!cache) {
					this.scheduleMeasure();
					return;
				}
				for (const row of cache.rows) {
					if (row === nativeSource) continue;
					this.setScrollLeft(row, scrollLeft);
				}
				for (const scrollbar of cache.scrollbars) {
					this.setScrollLeft(scrollbar, scrollLeft);
				}
			}

			private applyStoredScrolls(): void {
				for (const blockId of this.blockCacheById.keys()) {
					if (this.activeVisualScroll?.blockId === blockId) continue;
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
					if (this.activeVisualScroll?.blockId === measure.blockId) {
						this.refreshActiveVisualRows(cache.rows);
					}
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
			): { blockId: string; scrollLeft: number; surface: HTMLElement } | undefined {
				const element = target instanceof Element ? target : target instanceof Text ? (target.parentElement ?? undefined) : undefined;
				const surface = element?.closest<HTMLElement>(
					`.${SHIKI_BLOCK_SCROLL_ROW_CLASS}[data-shiki-block-id], .${SHIKI_BLOCK_SCROLLBAR_CLASS}[data-shiki-block-id]`,
				);
				const targetBlockId = this.blockIdFromElement(element);
				if (targetBlockId) {
					return { blockId: targetBlockId, scrollLeft: this.blockScrollLeft(targetBlockId), surface: surface! };
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
				this.touchSource = undefined;
				this.touchHorizontal = false;
				this.touchId = undefined;
				if (this.gestureInput === 'touch') this.gestureInput = undefined;
			}

			private resetPointer(): void {
				this.pointerId = undefined;
				this.pointerBlockId = undefined;
				this.pointerSource = undefined;
				this.pointerHorizontal = false;
				if (this.gestureInput === 'pointer') this.gestureInput = undefined;
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
					this.onPointerMove(event);
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
					this.onTouchMove(event);
				},
				touchend(event) {
					this.onTouchEnd(event);
				},
				touchcancel(event) {
					this.onTouchEnd(event);
				},
			},
		},
	);
}
