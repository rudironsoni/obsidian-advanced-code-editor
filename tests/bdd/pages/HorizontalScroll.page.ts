import { browser } from '@wdio/globals';
import { horizontalScrollFixtureNotes } from '../support/horizontalScrollFixtures.js';
import { executeObsidian } from '../support/executeObsidian.js';

const pluginId = 'advanced-code-block';
const horizontalScrollMarker = 'HORIZONTAL_SCROLL_MARKER';
const horizontalScrollEditText = '__WDIO_HORIZONTAL_SCROLL_EDIT__';

export type HorizontalScrollMode = 'reading' | 'live-preview' | 'source';
export type HorizontalScrollGesture = 'scrollbar' | 'wheel' | 'shift-wheel' | 'touch';

type PluginSettings = {
	wrapLines: boolean;
	showLineNumbers: boolean;
	inlineHighlighting: boolean;
	preferThemeColors: boolean;
};

type RuntimePlugin = {
	settings: PluginSettings;
	loadedSettings: PluginSettings;
	saveData?(data: PluginSettings): Promise<void> | void;
	updateCm6Plugin?(): Promise<void> | void;
};

type RuntimeApp = {
	isMobile: boolean;
	plugins: {
		plugins: Record<string, RuntimePlugin | undefined>;
	};
	vault: {
		getAbstractFileByPath(path: string): unknown;
		create(path: string, content: string): Promise<unknown>;
		modify(file: unknown, content: string): Promise<void>;
		read(file: unknown): Promise<string>;
		setConfig?(key: string, value: unknown): Promise<void> | void;
	};
	workspace: {
		activeLeaf?: RuntimeLeaf;
		getActiveFile?(): { path: string } | null;
		getLeaf(newLeaf?: boolean | 'tab'): RuntimeLeaf;
		setActiveLeaf?(leaf: RuntimeLeaf, options?: { focus?: boolean }): void;
	};
};

type RuntimeLeaf = {
	openFile(file: unknown, options?: unknown): Promise<void> | void;
	setViewState(state: unknown, options?: unknown): Promise<void> | void;
	view?: {
		containerEl?: HTMLElement;
		contentEl?: HTMLElement;
		editor?: RuntimeEditor;
		getState?(): { mode?: string; source?: boolean };
	};
};

type RuntimeEditor = {
	getValue(): string;
	setCursor(cursor: { line: number; ch: number }): void;
	focus(): void;
	replaceRange(text: string, from: { line: number; ch: number }): void;
	getCursor(): { line: number; ch: number };
	getLine(line: number): string;
};

export type HorizontalScrollBlockState = {
	index: number;
	blockId: string | null;
	text: string;
	lineNumberCount: number;
	lineNumberValues: string[];
	nativeBlockGutterCount: number;
	gutterMasksScrolledContent: boolean;
	rowCount: number;
	scrollbarCount: number;
	scrollOwnerCount: number;
	rowScrollSurfaceCount: number;
	rowScrollLeftMin: number;
	rowScrollLeftMax: number;
	rowScrollLeftValues: number[];
	rowClientWidthValues: number[];
	rowScrollWidthValues: number[];
	rowSpacerWidthValues: number[];
	rowTextValues: string[];
	livePreviewContentCount: number;
	livePreviewContentTranslateXValues: number[];
	livePreviewContentTranslateXSpread: number;
	visibleCodeContentCount: number;
	hitTestableCodeContentCount: number;
	visibleCodeGlyphCount: number;
	overflowingCodeGlyphCount: number;
	maxCodeGlyphRight: number | null;
	blockClipRight: number | null;
	transparentCodeContentCount: number;
	zeroRectCodeContentCount: number;
	hasShortLineContent: boolean;
	shortLineRowScrollLeft: number | null;
	shortLineContentTranslateX: number | null;
	visibleScrollbarCount: number;
	disabledScrollbarCount: number;
	scrollLeft: number;
	maxScrollLeft: number;
	clientWidth: number;
	scrollWidth: number;
	headerLeft: number | null;
	headerRight: number | null;
	headerWidth: number | null;
	headerHeight: number | null;
	headerDisplay: string | null;
	headerFlexDirection: string | null;
	headerBorderTopWidth: string | null;
	headerBorderRightWidth: string | null;
	headerBorderLeftWidth: string | null;
	headerBorderTopColor: string | null;
	headerLeftGroupLeft: number | null;
	headerLangLeft: number | null;
	headerLangCenterY: number | null;
	headerCopyRight: number | null;
	headerCopyCenterY: number | null;
	rowLeft: number | null;
	rowRight: number | null;
	rowBorderRightWidth: string | null;
	rowBorderLeftWidth: string | null;
	rowBorderRightColor: string | null;
	rootBorderTopWidth: string | null;
	rootBorderTopColor: string | null;
	gutterBorderRightWidth: string | null;
	gutterBorderRightColor: string | null;
	gutterMaskBorderLeftWidth: string | null;
	gutterMaskBorderLeftColor: string | null;
	gutterLeft: number | null;
	gutterRight: number | null;
	gutterWidth: number | null;
	gutterMinWidth: string | null;
	gutterPaddingRight: string | null;
	gutterMarginRight: string | null;
	gutterBackgroundColor: string | null;
	gutterColor: string | null;
	gutterFontFamily: string | null;
	gutterFontSize: string | null;
	gutterLineHeight: string | null;
	gutterTextAlign: string | null;
	gutterJustifyContent: string | null;
	gutterBoxSizing: string | null;
	gutterMaxVerticalGap: number | null;
	gutterVerticalOverpaint: number | null;
	rowMaxVerticalGap: number | null;
	rowVerticalOverpaint: number | null;
	firstLineNumberTextRight: number | null;
	firstLineNumberTextCenterY: number | null;
	codeContentLeft: number | null;
	gutterToCodeGap: number | null;
	codeLeft: number | null;
	codeMoved: number | null;
	gutterMoved: number | null;
};

export type HorizontalScrollState = {
	label: string;
	mode: HorizontalScrollMode;
	activeFile: string | null;
	isMobile: boolean;
	wrapLines: boolean | null;
	showLineNumbers: boolean | null;
	noteScrollLeft: number;
	documentScrollLeft: number;
	blockCount: number;
	rawFenceVisible: boolean;
	monacoEditorCount: number;
	sourceNativeGutterCount: number;
	sourceRenderedBlockChromeCount: number;
	sourceInternalLineNumberCount: number;
	sourceBlockScrollRowCount: number;
	sourceBlockScrollbarCount: number;
	sourceShikiTokenDecorationCount: number;
	blocks: HorizontalScrollBlockState[];
};

export type HorizontalScrollPerformanceMetrics = {
	trustedTouch: boolean;
	eventCount: number;
	p95DispatchMs: number;
	maxDispatchMs: number;
	p95FrameGapMs: number;
	maxFrameGapMs: number;
	frameSampleCount?: number;
	p95InputToPaintMs: number;
	maxInputToPaintMs: number;
	maxRowSpread: number;
	maxRowSpreadOffsets?: number[];
	maxSyncFrames: number;
	finalScrollLeft: number;
	rowScrollLeftMin: number;
	rowScrollLeftMax: number;
	noteScrollLeft: number;
	documentScrollLeft: number;
	backtrackCount: number;
	maxBacktrackPx: number;
};

export type HorizontalScrollPerformanceResult = {
	metrics: HorizontalScrollPerformanceMetrics;
	referenceMetrics?: HorizontalScrollPerformanceMetrics;
	touchDispatchMetrics?: HorizontalScrollTouchDispatchMetrics;
	touchDispatchReferenceMetrics?: HorizontalScrollTouchDispatchMetrics;
	responsivenessProbeMs?: number;
	state: HorizontalScrollState;
};

export type HorizontalScrollTouchDispatchMetrics = {
	rowCount: number;
	eventCount: number;
	p95DispatchMs: number;
	maxDispatchMs: number;
	maxEffectiveRowSpread: number;
	visualMovementValues: number[];
	visualContentClassValues: boolean[];
	noteScrollLeft: number;
	documentScrollLeft: number;
};

export type HorizontalScrollWheelLatencyResult = {
	dispatchMs: number;
	scrollLeftImmediatelyAfterDispatch: number;
	scrollLeftAfterOneAnimationFrame: number;
	noteScrollLeft: number;
	documentScrollLeft: number;
	state: HorizontalScrollState;
};

export type HorizontalScrollTakeoverResult = {
	touchMoveDefaultPrevented: boolean;
	rowScrollLeftValues: number[];
	effectiveRowScrollLeftValues: number[];
	visualRowMovementValues: number[];
	visualRowClassValues: boolean[];
	visualScrollOffset: string;
	noteScrollLeft: number;
	documentScrollLeft: number;
	state: HorizontalScrollState;
};

export type HorizontalScrollLineNumberLayoutComparison = {
	livePreview: HorizontalScrollState;
	reading: HorizontalScrollState;
};

export type ExactEditResult = {
	filePath: string | null;
	line: number;
	column: number;
	lineText: string;
	fileContainsEdit: boolean;
};

type OpenFixtureInput = {
	path: string;
	mode: HorizontalScrollMode;
};

type GestureInput = {
	mode: HorizontalScrollMode;
	blockIndex: number;
	gesture: HorizontalScrollGesture;
};

type RepeatedWheelInput = {
	mode: HorizontalScrollMode;
	blockIndex: number;
	frames: number;
	deltaX: number;
};

type NativeRowOverflowInput = {
	mode: HorizontalScrollMode;
	blockIndex: number;
};

type TouchGestureCoordinates = {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
	touchAction: string;
	bodyTouchAction: string;
	hitTargetClassName: string;
	hitTargetTouchAction: string;
};

class HorizontalScrollPage {
	readonly marker = horizontalScrollMarker;
	readonly editText = horizontalScrollEditText;

	async resetFixtureNotes(): Promise<void> {
		await executeObsidian(async ({ app }, fixtures) => {
			const runtimeApp = app as unknown as RuntimeApp;
			for (const [notePath, content] of Object.entries(fixtures)) {
				const file = runtimeApp.vault.getAbstractFileByPath(notePath);
				if (file) {
					await runtimeApp.vault.modify(file, content);
				} else {
					await runtimeApp.vault.create(notePath, content);
				}
			}
		}, horizontalScrollFixtureNotes);
	}

	async applySettings(input: { wrapLines: boolean; showLineNumbers: boolean }): Promise<void> {
		await executeObsidian(async ({ app }, settings) => {
			const runtimeApp = app as unknown as RuntimeApp;
			const pluginId = 'advanced-code-block';
			const plugin = runtimeApp.plugins.plugins[pluginId];
			if (!plugin) throw new Error(`${pluginId} is not loaded`);

			plugin.settings.wrapLines = settings.wrapLines;
			plugin.settings.showLineNumbers = settings.showLineNumbers;
			plugin.settings.inlineHighlighting = true;
			plugin.settings.preferThemeColors = true;
			plugin.loadedSettings = structuredClone(plugin.settings);
			await runtimeApp.vault.setConfig?.('showLineNumber', true);
			await plugin.saveData?.(plugin.settings);
			await plugin.updateCm6Plugin?.();
		}, input);
	}

	async openFixture(path: string, mode: HorizontalScrollMode): Promise<void> {
		await executeObsidian(
			async ({ app, obsidian }, input: OpenFixtureInput) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const file = runtimeApp.vault.getAbstractFileByPath(input.path);
				if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${input.path}`);

				const leaf = runtimeApp.workspace.activeLeaf ?? runtimeApp.workspace.getLeaf(false);
				const viewState =
					input.mode === 'reading' ? { file: input.path, mode: 'preview' } : { file: input.path, mode: 'source', source: input.mode === 'source' };
				await leaf.openFile(file, { active: true, state: viewState });
				await leaf.setViewState({ type: 'markdown', state: viewState, active: true }, { history: false });
				runtimeApp.workspace.setActiveLeaf?.(leaf, { focus: true });
			},
			{ path, mode },
		);

		await this.waitForMode(mode, path);
	}

	async waitForHorizontalScrollReady(mode: HorizontalScrollMode, expectedBlocks: number, requireOverflow: boolean): Promise<HorizontalScrollState> {
		let lastState: HorizontalScrollState | undefined;
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.collectScrollState(mode, 'ready');
					lastState = state;
					const hasExpectedBlocks = state.blockCount >= expectedBlocks;
					const hasOverflow = !requireOverflow || state.blocks.slice(0, expectedBlocks).every(block => block.maxScrollLeft > 0);
					return hasExpectedBlocks && hasOverflow;
				},
				{ timeout: 30000, timeoutMsg: `Horizontal scroll blocks did not become ready in ${mode}` },
			);
		} catch (error) {
			throw new Error(`Horizontal scroll blocks did not become ready in ${mode}: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.collectScrollState(mode, 'ready');
	}

	async waitForRawSourceReady(notePath: string): Promise<HorizontalScrollState> {
		let lastState: HorizontalScrollState | undefined;
		try {
			await browser.waitUntil(
				async () => {
					const state = await this.collectScrollState('source', 'raw-source-ready');
					lastState = state;
					return (
						state.activeFile === notePath &&
						state.rawFenceVisible &&
						state.monacoEditorCount === 0 &&
						state.sourceNativeGutterCount > 0 &&
						state.sourceRenderedBlockChromeCount === 0 &&
						state.sourceInternalLineNumberCount === 0 &&
						state.sourceBlockScrollRowCount === 0 &&
						state.sourceBlockScrollbarCount === 0
					);
				},
				{ timeout: 30000, timeoutMsg: `Raw Source mode did not become ready for ${notePath}` },
			);
		} catch (error) {
			throw new Error(`Raw Source mode did not become ready for ${notePath}: ${JSON.stringify(lastState)}`, { cause: error });
		}

		return this.collectScrollState('source', 'raw-source-ready');
	}

	async resetScrollPositions(mode: HorizontalScrollMode): Promise<void> {
		await executeObsidian(({ app }, selectedMode) => {
			const runtimeApp = app as unknown as RuntimeApp;
			const root =
				runtimeApp.workspace.activeLeaf?.view?.containerEl ??
				runtimeApp.workspace.activeLeaf?.view?.contentEl ??
				document.querySelector('.workspace-leaf.mod-active') ??
				document;
			const noteScroller =
				selectedMode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
			const scope = noteScroller ?? root;
			if (noteScroller) noteScroller.scrollLeft = 0;
			document.scrollingElement?.scrollTo({ left: 0 });
			const targets = [
				...scope.querySelectorAll<HTMLElement>('.shiki-block-scroll-row[data-shiki-block-id]'),
				...scope.querySelectorAll<HTMLElement>('.shiki-block-horizontal-scrollbar[data-shiki-block-id]'),
				...scope.querySelectorAll<HTMLElement>('.shiki-reading-block[data-shiki-block-id] .shiki-block-body'),
			];
			for (const target of targets) {
				target.scrollLeft = 0;
				target.dispatchEvent(new Event('scroll', { bubbles: true }));
			}
		}, mode);
	}

	async performGesture(mode: HorizontalScrollMode, blockIndex: number, gesture: HorizontalScrollGesture): Promise<HorizontalScrollState> {
		if (gesture === 'touch') {
			await this.performWebDriverTouchGesture(mode, blockIndex);
			await browser.pause(150);
			return this.collectScrollState(mode, `${gesture}-after`);
		}

		await executeObsidian(
			({ app }, input: GestureInput) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}
				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rootElement =
							scope.querySelector<HTMLElement>(`.shiki-reading-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`.shiki-live-preview-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`[data-shiki-block-id="${escapedBlockId}"]`);
						if (!rootElement) return null;

						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						const body = rootElement.querySelector<HTMLElement>('.shiki-block-body') ?? null;

						return {
							root: rootElement,
							body,
							row: rows[0] ?? null,
							rows,
							scrollbar: scrollbars[0] ?? null,
						};
					})
					.filter(entry => entry !== null) as Array<{
					root: HTMLElement;
					body: HTMLElement | null;
					row: HTMLElement | null;
					rows: HTMLElement[];
					scrollbar: HTMLElement | null;
				}>;
				const block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);

				const target = input.mode === 'live-preview' ? (block.row ?? block.scrollbar ?? block.body) : (block.scrollbar ?? block.row ?? block.body);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} has no horizontal scroll target`);

				const rect = target.getBoundingClientRect();
				const clientX = rect.left + Math.min(120, Math.max(8, rect.width / 2));
				const clientY = rect.top + Math.min(12, Math.max(4, rect.height / 2));
				const nextScrollLeft = Math.min(Math.max(240, target.clientWidth / 2), Math.max(0, target.scrollWidth - target.clientWidth));

				if (input.gesture === 'scrollbar') {
					target.scrollLeft = nextScrollLeft;
					target.dispatchEvent(new Event('scroll', { bubbles: true }));
					return;
				}

				if (input.gesture === 'wheel' || input.gesture === 'shift-wheel') {
					target.dispatchEvent(
						new WheelEvent('wheel', {
							bubbles: true,
							cancelable: true,
							clientX,
							clientY,
							deltaX: input.gesture === 'wheel' ? nextScrollLeft : 0,
							deltaY: input.gesture === 'shift-wheel' ? nextScrollLeft : 0,
							shiftKey: input.gesture === 'shift-wheel',
						}),
					);
					return;
				}
			},
			{ mode, blockIndex, gesture },
		);

		await browser.pause(150);
		return this.collectScrollState(mode, `${gesture}-after`);
	}

	async simulateWebKitTouchTakeover(blockIndex: number, codeLineNumber: number): Promise<HorizontalScrollTakeoverResult> {
		const result = await executeObsidian(
			async ({ app }, input: { blockIndex: number; codeLineNumber: number }) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const editor = runtimeApp.workspace.activeLeaf?.view?.editor;
				const fenceLines = (editor?.getValue().split('\n') ?? []).map((line, index) => ({ line, index })).filter(({ line }) => /^\s*```/.test(line));
				const openingFenceLine = fenceLines[input.blockIndex * 2]?.index;
				if (openingFenceLine === undefined) throw new Error(`Opening fence ${input.blockIndex + 1} was not found`);
				editor?.setCursor({ line: openingFenceLine + input.codeLineNumber, ch: 0 });
				editor?.focus();
				await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller = root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set(
					[...scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')]
						.map(element => element.dataset.shikiBlockId)
						.filter((blockId): blockId is string => !!blockId),
				);
				const blockId = [...blockIds][input.blockIndex];
				if (!blockId) throw new Error(`Code block ${input.blockIndex + 1} was not found`);
				const escapedBlockId = CSS.escape(blockId);
				const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
				const source = rows.find(
					row => row.querySelector<HTMLElement>('.shiki-live-preview-line-number')?.textContent?.trim() === String(input.codeLineNumber),
				);
				if (!source) throw new Error(`Code row ${input.codeLineNumber} was not found`);
				const target = source.querySelector<HTMLElement>('.shiki-live-preview-code-content') ?? source;
				const contentElements = rows.map(row => row.querySelector<HTMLElement>('.shiki-live-preview-code-content') ?? row);
				const baselineContentLeftValues = contentElements.map(element => element.getBoundingClientRect().left);
				for (const row of rows) row.scrollLeft = 0;
				if (noteScroller) noteScroller.scrollLeft = 0;
				document.scrollingElement?.scrollTo({ left: 0 });

				const pointerId = 73;
				const touchId = 74;
				const makeTouchEvent = (type: string, clientX: number): Event => {
					const event = new Event(type, { bubbles: true, cancelable: true });
					const touch = { clientX, clientY: 20, identifier: touchId, target } as unknown as Touch;
					const touches = { length: 1, item: (index: number) => (index === 0 ? touch : null), 0: touch } as unknown as TouchList;
					for (const property of ['changedTouches', 'targetTouches', 'touches']) {
						Object.defineProperty(event, property, { configurable: true, value: touches });
					}
					return event;
				};

				target.dispatchEvent(
					new PointerEvent('pointerdown', {
						bubbles: true,
						cancelable: true,
						clientX: 260,
						clientY: 20,
						pointerId,
						pointerType: 'touch',
					}),
				);
				target.dispatchEvent(makeTouchEvent('touchstart', 260));
				target.dispatchEvent(
					new PointerEvent('pointercancel', {
						bubbles: true,
						cancelable: true,
						clientX: 260,
						clientY: 20,
						pointerId,
						pointerType: 'touch',
					}),
				);
				source.scrollLeft = 240;
				const touchMove = makeTouchEvent('touchmove', 20);
				target.dispatchEvent(touchMove);
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				const effectiveRowScrollLeftValues = rows.map(row => {
					const content = row.querySelector<HTMLElement>('.shiki-live-preview-code-content');
					const transform = content ? getComputedStyle(content).transform : '';
					const translateX = !transform || transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
					return row.scrollLeft - translateX;
				});
				const visualRowMovementValues = contentElements.map(
					(element, index) => (baselineContentLeftValues[index] ?? 0) - element.getBoundingClientRect().left,
				);

				return {
					touchMoveDefaultPrevented: touchMove.defaultPrevented,
					rowScrollLeftValues: rows.map(row => row.scrollLeft),
					effectiveRowScrollLeftValues,
					visualRowMovementValues,
					visualRowClassValues: contentElements.map(element => element.classList.contains('shiki-block-visual-scroll-content')),
					visualScrollOffset: getComputedStyle(source).getPropertyValue('--shiki-block-visual-scroll-offset'),
					noteScrollLeft: noteScroller?.scrollLeft ?? 0,
					documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
				};
			},
			{ blockIndex, codeLineNumber },
		);
		return { ...result, state: await this.collectScrollState('live-preview', 'webkit-touch-takeover') };
	}

	private async performWebDriverTouchGesture(mode: HorizontalScrollMode, blockIndex: number): Promise<void> {
		const coordinates = await executeObsidian(
			({ app }, input: NativeRowOverflowInput): TouchGestureCoordinates => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}
				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rootElement =
							scope.querySelector<HTMLElement>(`.shiki-reading-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`.shiki-live-preview-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`[data-shiki-block-id="${escapedBlockId}"]`);
						if (!rootElement) return null;
						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						const body = rootElement.querySelector<HTMLElement>('.shiki-block-body') ?? null;
						return {
							body,
							row: rows[0] ?? null,
							scrollbar: scrollbars[0] ?? null,
						};
					})
					.filter(entry => entry !== null) as Array<{
					body: HTMLElement | null;
					row: HTMLElement | null;
					scrollbar: HTMLElement | null;
				}>;
				const block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);

				const target = input.mode === 'live-preview' ? (block.row ?? block.scrollbar ?? block.body) : (block.body ?? block.scrollbar ?? block.row);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} has no touch target`);
				target.scrollIntoView({ block: 'center', inline: 'nearest' });

				const rect = target.getBoundingClientRect();
				const inset = Math.min(24, Math.max(8, rect.width / 8));
				const startX = Math.round(Math.min(rect.right - inset, rect.left + rect.width * 0.8));
				const endX = Math.round(Math.max(rect.left + inset, rect.left + rect.width * 0.2));
				const startY = Math.round(rect.top + Math.min(Math.max(8, rect.height / 2), Math.max(8, rect.height - 4)));
				const hitTarget = document.elementFromPoint(startX, startY);
				const hitElement = hitTarget instanceof HTMLElement ? hitTarget : target;

				return {
					startX,
					startY,
					endX,
					endY: startY,
					touchAction: getComputedStyle(target).touchAction,
					bodyTouchAction: block.body ? getComputedStyle(block.body).touchAction : '',
					hitTargetClassName: hitElement.className,
					hitTargetTouchAction: getComputedStyle(hitElement).touchAction,
				};
			},
			{ mode, blockIndex },
		);

		const allowsNativeHorizontalPan = (touchAction: string): boolean => touchAction === 'manipulation' || touchAction.includes('pan-x');
		if (mode === 'reading') {
			if (!allowsNativeHorizontalPan(coordinates.touchAction) || !allowsNativeHorizontalPan(coordinates.bodyTouchAction)) {
				throw new Error(`Expected Reading mode touch ancestors to allow native horizontal pan: ${JSON.stringify(coordinates)}`);
			}
		} else if (!allowsNativeHorizontalPan(coordinates.touchAction) || !allowsNativeHorizontalPan(coordinates.hitTargetTouchAction)) {
			throw new Error(`Expected Live Preview touch targets to allow native horizontal pan: ${JSON.stringify(coordinates)}`);
		}

		await browser.performActions([
			{
				type: 'pointer',
				id: 'block-scroll-finger',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x: coordinates.startX, y: coordinates.startY },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pause', duration: 80 },
					{ type: 'pointerMove', duration: 450, x: coordinates.endX, y: coordinates.endY },
					{ type: 'pointerUp', button: 0 },
				],
			},
		]);
		await browser.releaseActions();
	}

	async forceNativeRowOverflowScroll(mode: HorizontalScrollMode, blockIndex: number): Promise<HorizontalScrollState> {
		await executeObsidian(
			({ app }, input: NativeRowOverflowInput) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}
				const block = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						return { rows, scrollbar: scrollbars[0] ?? null };
					})
					.filter(entry => entry.rows.length > 0)[input.blockIndex];
				const row = block?.rows[0];
				if (!row) throw new Error(`Code block ${input.blockIndex + 1} has no native row scroll target`);

				row.scrollLeft = Math.max(row.scrollWidth - row.clientWidth, row.clientWidth * 4);
				row.dispatchEvent(new Event('scroll', { bubbles: true }));
			},
			{ mode, blockIndex },
		);

		await browser.pause(150);
		return this.collectScrollState(mode, 'native-row-overflow-after');
	}

	async wheelOverscrollRightEdge(mode: HorizontalScrollMode, blockIndex: number): Promise<HorizontalScrollState> {
		await executeObsidian(
			async ({ app }, input: NativeRowOverflowInput): Promise<void> => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}
				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						return { rows, scrollbar: scrollbars[0] ?? null };
					})
					.filter(block => block.rows.length > 0 || block.scrollbar !== null);
				const block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);

				const target = input.mode === 'live-preview' ? (block.rows[0] ?? block.scrollbar) : (block.scrollbar ?? block.rows[0]);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} has no horizontal scroll target`);

				if (noteScroller) {
					noteScroller.scrollLeft = 0;
				}
				document.scrollingElement?.scrollTo({ left: 0 });

				const rect = target.getBoundingClientRect();
				const clientX = rect.left + Math.min(120, Math.max(8, rect.width / 2));
				const clientY = rect.top + Math.min(10, Math.max(4, rect.height / 2));
				const observedBlockScrollLeft = () =>
					Math.max(0, target.scrollLeft, block.scrollbar?.scrollLeft ?? 0, ...block.rows.map(row => row.scrollLeft));
				let lastObservedScrollLeft = 0;
				let unchangedWheelCount = 0;

				for (let index = 0; index < 40; index++) {
					target.dispatchEvent(
						new WheelEvent('wheel', {
							bubbles: true,
							cancelable: true,
							clientX,
							clientY,
							deltaX: 480,
						}),
					);
					await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
					const observedScrollLeft = observedBlockScrollLeft();
					if (observedScrollLeft <= lastObservedScrollLeft + 1) {
						unchangedWheelCount++;
					} else {
						unchangedWheelCount = 0;
					}
					lastObservedScrollLeft = observedScrollLeft;
					if (unchangedWheelCount >= 3) {
						break;
					}
				}
				if (lastObservedScrollLeft <= 0) {
					throw new Error('Expected right-edge setup to scroll the Live Preview block horizontally');
				}

				for (let index = 0; index < 8; index++) {
					const event = new WheelEvent('wheel', {
						bubbles: true,
						cancelable: true,
						clientX,
						clientY,
						deltaX: 240,
					});
					target.dispatchEvent(event);
					if (!event.defaultPrevented) {
						throw new Error(`Expected right-edge wheel overscroll to be prevented at event ${index + 1}`);
					}
					await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
					const observedScrollLeft = observedBlockScrollLeft();
					if (observedScrollLeft > lastObservedScrollLeft + 1) {
						throw new Error(`Expected right-edge overscroll not to advance beyond ${lastObservedScrollLeft}, observed ${observedScrollLeft}`);
					}
				}
				await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
			},
			{ mode, blockIndex },
		);

		await browser.pause(150);
		return this.collectScrollState(mode, 'right-edge-wheel-overscroll-after');
	}

	async measureRepeatedWheelScroll(mode: HorizontalScrollMode, blockIndex: number): Promise<HorizontalScrollPerformanceResult> {
		const measurement = await executeObsidian(
			async ({ app }, input: RepeatedWheelInput): Promise<{ metrics: HorizontalScrollPerformanceMetrics; responsivenessProbeMs: number }> => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}
				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						return { blockId, rows, scrollbar: scrollbars[0] ?? null };
					})
					.filter(block => block.rows.length > 0 || block.scrollbar !== null);
				const block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);

				const target = input.mode === 'live-preview' ? (block.rows[0] ?? block.scrollbar) : (block.scrollbar ?? block.rows[0]);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} has no horizontal scroll target`);
				for (const row of block.rows) {
					row.scrollLeft = 0;
				}
				if (block.scrollbar) {
					block.scrollbar.scrollLeft = 0;
				}
				if (noteScroller) {
					noteScroller.scrollLeft = 0;
				}
				document.scrollingElement?.scrollTo({ left: 0 });

				const rect = target.getBoundingClientRect();
				const clientX = rect.left + Math.min(120, Math.max(8, rect.width / 2));
				const clientY = rect.top + Math.min(10, Math.max(4, rect.height / 2));
				const dispatchDurations: number[] = [];
				let maxFrameGapMs = 0;
				let lastFrame = performance.now();
				let lastObservedScrollLeft = 0;
				let backtrackCount = 0;
				let maxBacktrackPx = 0;

				target.dispatchEvent(
					new WheelEvent('wheel', {
						bubbles: true,
						cancelable: true,
						clientX,
						clientY,
						deltaX: Math.sign(input.deltaX) || 1,
					}),
				);
				await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
				for (const row of block.rows) {
					row.scrollLeft = 0;
				}
				if (block.scrollbar) {
					block.scrollbar.scrollLeft = 0;
				}
				lastFrame = performance.now();

				for (let index = 0; index < input.frames; index++) {
					await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
					const frameNow = performance.now();
					maxFrameGapMs = Math.max(maxFrameGapMs, frameNow - lastFrame);
					lastFrame = frameNow;
					const beforeDispatch = performance.now();
					target.dispatchEvent(
						new WheelEvent('wheel', {
							bubbles: true,
							cancelable: true,
							clientX,
							clientY,
							deltaX: input.deltaX,
						}),
					);
					dispatchDurations.push(performance.now() - beforeDispatch);
					await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
					const observedScrollLeft = Math.max(0, target.scrollLeft, block.scrollbar?.scrollLeft ?? 0, ...block.rows.map(row => row.scrollLeft));
					if (observedScrollLeft + 1 < lastObservedScrollLeft) {
						backtrackCount++;
						maxBacktrackPx = Math.max(maxBacktrackPx, lastObservedScrollLeft - observedScrollLeft);
					}
					lastObservedScrollLeft = observedScrollLeft;
				}

				await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
				const contentTranslateXValues = [
					...scope.querySelectorAll<HTMLElement>(`.shiki-live-preview-code-content[data-shiki-block-id="${CSS.escape(block.blockId)}"]`),
				].map(element => {
					const transform = getComputedStyle(element).transform;
					if (!transform || transform === 'none') return 0;
					const matrix = new DOMMatrixReadOnly(transform);
					return matrix.m41;
				});
				const effectiveContentScrollLeft = Math.max(0, ...contentTranslateXValues.map(value => -value));
				const rowScrollLeftValues = block.rows.map(row => row.scrollLeft);
				const sortedDurations = [...dispatchDurations].sort((first, second) => first - second);
				const p95Index = Math.max(0, Math.ceil(sortedDurations.length * 0.95) - 1);
				const probeStartedAt = performance.now();
				await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 0))));
				return {
					metrics: {
						trustedTouch: false,
						eventCount: dispatchDurations.length,
						p95DispatchMs: sortedDurations[p95Index] ?? 0,
						maxDispatchMs: Math.max(0, ...dispatchDurations),
						p95FrameGapMs: maxFrameGapMs,
						maxFrameGapMs,
						p95InputToPaintMs: 0,
						maxInputToPaintMs: 0,
						maxRowSpread: 0,
						maxSyncFrames: 0,
						finalScrollLeft: Math.max(
							0,
							target.scrollLeft,
							block.scrollbar?.scrollLeft ?? 0,
							...block.rows.map(row => row.scrollLeft),
							effectiveContentScrollLeft,
						),
						rowScrollLeftMin: rowScrollLeftValues.length ? Math.min(...rowScrollLeftValues) : 0,
						rowScrollLeftMax: Math.max(0, ...block.rows.map(row => row.scrollLeft)),
						noteScrollLeft: noteScroller?.scrollLeft ?? 0,
						documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
						backtrackCount,
						maxBacktrackPx,
					},
					responsivenessProbeMs: performance.now() - probeStartedAt,
				};
			},
			{ mode, blockIndex, frames: 60, deltaX: 24 },
		);
		const state = await this.collectScrollState(mode, 'repeated-wheel-after');
		return { metrics: measurement.metrics, responsivenessProbeMs: measurement.responsivenessProbeMs, state };
	}

	async measureRepeatedTouchScroll(mode: HorizontalScrollMode, blockIndex: number): Promise<HorizontalScrollPerformanceResult> {
		const probeKey = '__shikiWdioTrustedTouchProbe';
		await executeObsidian(
			async ({ app }, input: { mode: HorizontalScrollMode; blockIndex: number; probeKey: string }) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set(
					[...scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')]
						.map(element => element.dataset.shikiBlockId)
						.filter((blockId): blockId is string => !!blockId),
				);
				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rootElement =
							scope.querySelector<HTMLElement>(`.shiki-reading-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`[data-shiki-block-id="${escapedBlockId}"]`);
						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbar = scope.querySelector<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`);
						const body = rootElement?.querySelector<HTMLElement>('.shiki-block-body') ?? null;
						return { blockId, rows, scrollbar, body };
					})
					.filter(block => block.rows.length > 0 || block.scrollbar || block.body);
				let block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);
				const initialTarget =
					input.mode === 'live-preview' ? (block.rows[0] ?? block.scrollbar ?? block.body) : (block.body ?? block.scrollbar ?? block.rows[0]);
				if (!initialTarget) throw new Error(`Code block ${input.blockIndex + 1} has no trusted touch target`);
				initialTarget.scrollIntoView({ block: 'center', inline: 'nearest' });
				await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
				const escapedBlockId = CSS.escape(block.blockId);
				const currentRootElement =
					scope.querySelector<HTMLElement>(`.shiki-reading-block[data-shiki-block-id="${escapedBlockId}"]`) ??
					scope.querySelector<HTMLElement>(`[data-shiki-block-id="${escapedBlockId}"]`);
				block = {
					blockId: block.blockId,
					rows: [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)],
					scrollbar: scope.querySelector<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
					body: currentRootElement?.querySelector<HTMLElement>('.shiki-block-body') ?? null,
				};
				const target =
					input.mode === 'live-preview' ? (block.rows[0] ?? block.scrollbar ?? block.body) : (block.body ?? block.scrollbar ?? block.rows[0]);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} remounted without a trusted touch target`);

				const dispatchDurations: number[] = [];
				const frameGaps: number[] = [];
				const inputToPaintDurations: number[] = [];
				const rowSpreads: number[] = [];
				const syncFrames: number[] = [];
				let eventCount = 0;
				let scrollEventCount = 0;
				let lastFrame = performance.now();
				let lastInputAt: number | undefined;
				let lastActivityAt: number | undefined;
				let lastObservedScrollLeft = 0;
				let backtrackCount = 0;
				let maxBacktrackPx = 0;
				let maxRowSpread = 0;
				let maxRowSpreadOffsets: number[] = [];
				let frame = 0;
				let spreadFrame = 0;
				let gestureStarted = false;
				const onPointerMove = (): void => {
					const startedAt = performance.now();
					gestureStarted = true;
					eventCount++;
					lastInputAt = startedAt;
					lastActivityAt = startedAt;
					queueMicrotask(() => dispatchDurations.push(performance.now() - startedAt));
				};
				const recordSpread = (): void => {
					const sampledRows = block.rows.length
						? [
								...new Set(
									[block.rows[0], block.rows[Math.floor(block.rows.length / 2)], block.rows.at(-1)].filter(
										(row): row is HTMLElement => !!row,
									),
								),
							]
						: [];
					const nativeOffsets = sampledRows.map(row => row.scrollLeft);
					const nativeSpread = nativeOffsets.length ? Math.max(...nativeOffsets) - Math.min(...nativeOffsets) : 0;
					const offsets =
						sampledRows.length && nativeSpread > 1
							? sampledRows.map(row => {
									const content = row.querySelector<HTMLElement>('.shiki-live-preview-code-content');
									const transform = content ? getComputedStyle(content).transform : '';
									const translateX = !transform || transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
									return row.scrollLeft - translateX;
								})
							: nativeOffsets.length
								? nativeOffsets
								: [target.scrollLeft];
					const spread = Math.max(0, ...offsets) - Math.min(...offsets);
					if (spread > maxRowSpread) {
						maxRowSpread = spread;
						maxRowSpreadOffsets = offsets;
					}
					spreadFrame = 0;
					rowSpreads.push(spread);
					syncFrames.push(1);
					const observed = Math.max(0, target.scrollLeft, block.scrollbar?.scrollLeft ?? 0, ...offsets);
					if (observed + 1 < lastObservedScrollLeft) {
						backtrackCount++;
						maxBacktrackPx = Math.max(maxBacktrackPx, lastObservedScrollLeft - observed);
					}
					lastObservedScrollLeft = observed;
				};
				const onScroll = (): void => {
					if (!gestureStarted) return;
					scrollEventCount++;
					lastActivityAt = performance.now();
					if (!spreadFrame) {
						spreadFrame = requestAnimationFrame(() => recordSpread());
					}
				};
				const tick = (now: number): void => {
					if (lastActivityAt !== undefined && now - lastActivityAt <= 100) frameGaps.push(now - lastFrame);
					lastFrame = now;
					if (lastInputAt !== undefined && now >= lastInputAt) {
						inputToPaintDurations.push(now - lastInputAt);
						lastInputAt = undefined;
					}
					frame = requestAnimationFrame(tick);
				};
				target.addEventListener('pointermove', onPointerMove, true);
				for (const element of [...block.rows, block.scrollbar, block.body].filter((element): element is HTMLElement => !!element)) {
					element.addEventListener('scroll', onScroll);
				}
				frame = requestAnimationFrame(tick);
				const probeHost = document.documentElement as HTMLElement & Record<string, unknown>;
				probeHost[input.probeKey] = {
					finish: () => {
						cancelAnimationFrame(frame);
						if (spreadFrame) cancelAnimationFrame(spreadFrame);
						target.removeEventListener('pointermove', onPointerMove, true);
						for (const element of [...block.rows, block.scrollbar, block.body].filter((element): element is HTMLElement => !!element)) {
							element.removeEventListener('scroll', onScroll);
						}
						const result = {
							dispatchDurations,
							frameGaps,
							inputToPaintDurations,
							rowSpreads,
							syncFrames,
							eventCount: eventCount + scrollEventCount,
							backtrackCount,
							maxBacktrackPx,
							maxRowSpreadOffsets,
						};
						delete probeHost[input.probeKey];
						return result;
					},
				};
			},
			{ mode, blockIndex, probeKey },
		);

		await this.performWebDriverTouchGesture(mode, blockIndex);
		await browser.pause(100);
		const raw = await executeObsidian((_, key: string) => {
			const probeHost = document.documentElement as HTMLElement & Record<string, unknown>;
			const probe = probeHost[key] as
				| {
						finish(): {
							dispatchDurations: number[];
							frameGaps: number[];
							inputToPaintDurations: number[];
							rowSpreads: number[];
							syncFrames: number[];
							eventCount: number;
							backtrackCount: number;
							maxBacktrackPx: number;
							maxRowSpreadOffsets: number[];
						};
				  }
				| undefined;
			if (!probe) throw new Error('Trusted touch performance probe was not found');
			return probe.finish();
		}, probeKey);
		const percentile95 = (values: number[]): number => {
			const sorted = [...values].sort((first, second) => first - second);
			return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
		};
		const state = await this.collectScrollState(mode, 'repeated-touch-after');
		const block = state.blocks[blockIndex];
		if (!block) throw new Error(`Code block ${blockIndex + 1} was not found after trusted touch`);
		const probeStartedAt = performance.now();
		await browser.executeAsync(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
		return {
			metrics: {
				trustedTouch: true,
				eventCount: raw.eventCount,
				p95DispatchMs: percentile95(raw.dispatchDurations),
				maxDispatchMs: Math.max(0, ...raw.dispatchDurations),
				p95FrameGapMs: percentile95(raw.frameGaps),
				maxFrameGapMs: Math.max(0, ...raw.frameGaps),
				frameSampleCount: raw.frameGaps.length,
				p95InputToPaintMs: percentile95(raw.inputToPaintDurations),
				maxInputToPaintMs: Math.max(0, ...raw.inputToPaintDurations),
				maxRowSpread: Math.max(0, ...raw.rowSpreads),
				maxRowSpreadOffsets: raw.maxRowSpreadOffsets,
				maxSyncFrames: Math.max(0, ...raw.syncFrames),
				finalScrollLeft: block.scrollLeft,
				rowScrollLeftMin: block.rowScrollLeftMin,
				rowScrollLeftMax: block.rowScrollLeftMax,
				noteScrollLeft: state.noteScrollLeft,
				documentScrollLeft: state.documentScrollLeft,
				backtrackCount: raw.backtrackCount,
				maxBacktrackPx: raw.maxBacktrackPx,
			},
			responsivenessProbeMs: performance.now() - probeStartedAt,
			state,
		};
	}

	async measureSyntheticTouchDispatch(blockIndex: number): Promise<HorizontalScrollTouchDispatchMetrics> {
		return executeObsidian(
			async ({ app }, input: { blockIndex: number; eventCount: number }): Promise<HorizontalScrollTouchDispatchMetrics> => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller = root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set(
					[...scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')]
						.map(element => element.dataset.shikiBlockId)
						.filter((blockId): blockId is string => !!blockId),
				);
				const blockId = [...blockIds][input.blockIndex];
				if (!blockId) throw new Error(`Code block ${input.blockIndex + 1} was not found`);
				const escapedBlockId = CSS.escape(blockId);
				const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
				const source = rows[0];
				const target = source?.querySelector<HTMLElement>('.shiki-live-preview-code-content') ?? source;
				if (!source || !target) throw new Error(`Code block ${input.blockIndex + 1} has no touch source`);
				for (const row of rows) row.scrollLeft = 0;
				if (noteScroller) noteScroller.scrollLeft = 0;
				document.scrollingElement?.scrollTo({ left: 0 });

				const touchId = 83;
				const makeTouchEvent = (type: string, clientX: number): Event => {
					const event = new Event(type, { bubbles: true, cancelable: true });
					const touch = { clientX, clientY: 20, identifier: touchId, target } as unknown as Touch;
					const touches = { length: 1, item: (index: number) => (index === 0 ? touch : null), 0: touch } as unknown as TouchList;
					for (const property of ['changedTouches', 'targetTouches', 'touches']) {
						Object.defineProperty(event, property, { configurable: true, value: touches });
					}
					return event;
				};
				const contentElements = rows.map(row => row.querySelector<HTMLElement>('.shiki-live-preview-code-content') ?? row);
				for (const row of rows) row.scrollLeft = 0;
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				const baselineContentLeftValues = contentElements.map(element => element.getBoundingClientRect().left);

				target.dispatchEvent(makeTouchEvent('touchstart', 260));
				const dispatchDurations: number[] = [];
				const dispatchMove = (offset: number): void => {
					source.scrollLeft = offset;
					const event = makeTouchEvent('touchmove', 260 - offset);
					const startedAt = performance.now();
					target.dispatchEvent(event);
					dispatchDurations.push(performance.now() - startedAt);
				};
				dispatchMove(200);
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				const visualMovements = contentElements.map((element, index) => (baselineContentLeftValues[index] ?? 0) - element.getBoundingClientRect().left);
				const maxEffectiveRowSpread = Math.max(...visualMovements) - Math.min(...visualMovements);
				for (let index = 1; index < input.eventCount; index++) {
					const offset = index % 2 === 0 ? 200 : 220;
					dispatchMove(offset);
				}
				target.dispatchEvent(makeTouchEvent('touchend', 40));
				const sortedDurations = [...dispatchDurations].sort((first, second) => first - second);
				const p95Index = Math.max(0, Math.ceil(sortedDurations.length * 0.95) - 1);
				return {
					rowCount: rows.length,
					eventCount: dispatchDurations.length,
					p95DispatchMs: sortedDurations[p95Index] ?? 0,
					maxDispatchMs: Math.max(0, ...dispatchDurations),
					maxEffectiveRowSpread,
					visualMovementValues: visualMovements,
					visualContentClassValues: contentElements.map(element => element.classList.contains('shiki-block-visual-scroll-content')),
					noteScrollLeft: noteScroller?.scrollLeft ?? 0,
					documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
				};
			},
			{ blockIndex, eventCount: 60 },
		);
	}

	async measureFirstWheelLatency(mode: HorizontalScrollMode, blockIndex: number): Promise<HorizontalScrollWheelLatencyResult> {
		const metrics = await executeObsidian(
			async ({ app }, input: { mode: HorizontalScrollMode; blockIndex: number; deltaX: number }) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}
				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						return { blockId, rows, scrollbar: scrollbars[0] ?? null };
					})
					.filter(block => block.rows.length > 0 || block.scrollbar !== null);
				const block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);

				const target = input.mode === 'live-preview' ? (block.rows[0] ?? block.scrollbar) : (block.scrollbar ?? block.rows[0]);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} has no horizontal scroll target`);
				for (const row of block.rows) {
					row.scrollLeft = 0;
				}
				if (block.scrollbar) {
					block.scrollbar.scrollLeft = 0;
				}
				if (noteScroller) {
					noteScroller.scrollLeft = 0;
				}
				document.scrollingElement?.scrollTo({ left: 0 });

				const rect = target.getBoundingClientRect();
				const clientX = rect.left + Math.min(120, Math.max(8, rect.width / 2));
				const clientY = rect.top + Math.min(10, Math.max(4, rect.height / 2));
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				const beforeDispatch = performance.now();
				target.dispatchEvent(
					new WheelEvent('wheel', {
						bubbles: true,
						cancelable: true,
						clientX,
						clientY,
						deltaX: input.deltaX,
					}),
				);
				const dispatchMs = performance.now() - beforeDispatch;
				const scrollLeftImmediatelyAfterDispatch = Math.max(
					0,
					target.scrollLeft,
					block.scrollbar?.scrollLeft ?? 0,
					...block.rows.map(row => row.scrollLeft),
				);
				await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
				const scrollLeftAfterOneAnimationFrame = Math.max(
					0,
					target.scrollLeft,
					block.scrollbar?.scrollLeft ?? 0,
					...block.rows.map(row => row.scrollLeft),
				);

				return {
					dispatchMs,
					scrollLeftImmediatelyAfterDispatch,
					scrollLeftAfterOneAnimationFrame,
					noteScrollLeft: noteScroller?.scrollLeft ?? 0,
					documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
				};
			},
			{ mode, blockIndex, deltaX: 48 },
		);
		let state = await this.collectScrollState(mode, 'first-wheel-latency-after');
		await browser.waitUntil(
			async () => {
				state = await this.collectScrollState(mode, 'first-wheel-latency-after');
				const block = state.blocks[blockIndex];
				return (
					block !== undefined && Math.abs(block.rowScrollLeftMin - block.scrollLeft) <= 1 && Math.abs(block.rowScrollLeftMax - block.scrollLeft) <= 1
				);
			},
			{
				timeout: 5000,
				timeoutMsg: `Live Preview rows did not share first wheel scroll position: ${JSON.stringify(state)}`,
			},
		);
		return { ...metrics, state };
	}

	async compareLineNumberLayoutWithReading(notePath: string): Promise<HorizontalScrollLineNumberLayoutComparison> {
		await this.resetScrollPositions('live-preview');
		await this.waitForHorizontalScrollReady('live-preview', 1, true);
		const livePreview = await this.collectStableLayoutState('live-preview', 'line-number-layout-live-preview');
		await this.openFixture(notePath, 'reading');
		await this.waitForHorizontalScrollReady('reading', 1, true);
		await this.resetScrollPositions('reading');
		await this.waitForHorizontalScrollReady('reading', 1, true);
		const reading = await this.collectStableLayoutState('reading', 'line-number-layout-reading');
		await this.openFixture(notePath, 'live-preview');
		await this.waitForHorizontalScrollReady('live-preview', 1, true);
		return { livePreview, reading };
	}

	private async collectStableLayoutState(mode: HorizontalScrollMode, label: string): Promise<HorizontalScrollState> {
		let previous: HorizontalScrollState | undefined;
		let stable: HorizontalScrollState | undefined;
		await browser.waitUntil(
			async () => {
				const current = await this.collectScrollState(mode, label);
				const block = current.blocks[0];
				if (!block || !this.hasComparableLayoutGeometry(current, block)) {
					previous = current;
					return false;
				}
				if (previous && this.layoutStatesMatch(previous, current)) {
					stable = current;
					return true;
				}
				previous = current;
				return false;
			},
			{ timeout: 5000, timeoutMsg: `${mode} line-number layout did not settle` },
		);
		return stable ?? this.collectScrollState(mode, label);
	}

	private hasComparableLayoutGeometry(state: HorizontalScrollState, block: HorizontalScrollBlockState): boolean {
		return (
			block.lineNumberValues.length > 0 &&
			block.headerLeft !== null &&
			block.headerRight !== null &&
			block.headerHeight !== null &&
			block.headerLeftGroupLeft !== null &&
			block.headerLangLeft !== null &&
			block.headerLangCenterY !== null &&
			block.headerCopyRight !== null &&
			block.headerCopyCenterY !== null &&
			block.gutterWidth !== null &&
			block.gutterRight !== null &&
			block.firstLineNumberTextRight !== null &&
			block.gutterToCodeGap !== null &&
			block.codeContentLeft !== null &&
			(state.mode !== 'live-preview' ||
				(block.nativeBlockGutterCount > 0 && block.rowLeft !== null && block.rowRight !== null && block.gutterMasksScrolledContent))
		);
	}

	private layoutStatesMatch(first: HorizontalScrollState, second: HorizontalScrollState): boolean {
		const firstBlock = first.blocks[0];
		const secondBlock = second.blocks[0];
		if (!firstBlock || !secondBlock || first.mode !== second.mode || first.blockCount !== second.blockCount) {
			return false;
		}
		if (firstBlock.lineNumberValues.join('\n') !== secondBlock.lineNumberValues.join('\n')) {
			return false;
		}

		const numericFields: Array<keyof HorizontalScrollBlockState> = [
			'clientWidth',
			'scrollWidth',
			'headerLeft',
			'headerRight',
			'headerWidth',
			'headerHeight',
			'headerLeftGroupLeft',
			'headerLangLeft',
			'headerLangCenterY',
			'headerCopyRight',
			'headerCopyCenterY',
			'rowLeft',
			'rowRight',
			'gutterLeft',
			'gutterRight',
			'gutterWidth',
			'firstLineNumberTextRight',
			'firstLineNumberTextCenterY',
			'codeContentLeft',
			'gutterToCodeGap',
		];

		return numericFields.every(field => {
			const firstValue = firstBlock[field];
			const secondValue = secondBlock[field];
			if (firstValue === null || secondValue === null) {
				return firstValue === secondValue;
			}
			return typeof firstValue === 'number' && typeof secondValue === 'number' && Math.abs(firstValue - secondValue) <= 0.5;
		});
	}

	async editMarkerAfterScroll(): Promise<ExactEditResult> {
		return executeObsidian(
			async ({ app }, input) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const leaf = runtimeApp.workspace.activeLeaf;
				const editor = leaf?.view?.editor;
				if (!editor) throw new Error('Active markdown editor was not available for exact edit');

				const lines = editor.getValue().split('\n');
				const line = lines.findIndex(value => value.includes(input.marker));
				if (line < 0) throw new Error(`Marker not found: ${input.marker}`);

				const column = lines[line].indexOf(input.marker) + input.marker.length;
				editor.focus();
				editor.setCursor({ line, ch: column });
				editor.replaceRange(input.editText, { line, ch: column });

				const filePath = runtimeApp.workspace.getActiveFile?.()?.path ?? null;
				const file = filePath ? runtimeApp.vault.getAbstractFileByPath(filePath) : null;
				let content = editor.getValue();
				const expected = `${input.marker}${input.editText}`;
				for (let attempt = 0; attempt < 30; attempt++) {
					content = file ? await runtimeApp.vault.read(file) : editor.getValue();
					if (content.includes(expected)) {
						break;
					}
					if (editor.getValue().includes(expected)) {
						content = editor.getValue();
						break;
					}
					await new Promise(resolve => window.setTimeout(resolve, 100));
				}
				const editedLine = content.split('\n')[line] ?? '';

				return {
					filePath,
					line,
					column,
					lineText: editedLine,
					fileContainsEdit: content.includes(expected),
				};
			},
			{ marker: this.marker, editText: this.editText },
		);
	}

	async collectScrollState(mode: HorizontalScrollMode, label: string): Promise<HorizontalScrollState> {
		return executeObsidian(
			({ app }, input) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const root =
					runtimeApp.workspace.activeLeaf?.view?.containerEl ??
					runtimeApp.workspace.activeLeaf?.view?.contentEl ??
					document.querySelector('.workspace-leaf.mod-active') ??
					document;
				const pluginId = 'advanced-code-block';
				const plugin = runtimeApp.plugins.plugins[pluginId];
				const noteScroller =
					input.mode === 'reading' ? root.querySelector<HTMLElement>('.markdown-preview-view') : root.querySelector<HTMLElement>('.cm-scroller');
				const scope = noteScroller ?? root;
				const activeText = scope.textContent ?? '';
				const visibleElements = (selector: string): HTMLElement[] =>
					[...scope.querySelectorAll<HTMLElement>(selector)].filter(element => {
						const style = getComputedStyle(element);
						const rect = element.getBoundingClientRect();
						return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
					});
				const sourceNativeGutterCount =
					input.mode === 'source' ? visibleElements('.cm-lineNumbers .cm-gutterElement, .cm-gutters .cm-gutterElement').length : 0;
				const sourceRenderedBlockChromeCount =
					input.mode === 'source'
						? scope.querySelectorAll(
								[
									'.shiki-live-preview-header',
									'.shiki-block-header',
									'.shiki-copy-button',
									'.shiki-live-preview-fence-text',
									'.shiki-live-preview-code-content',
									'.shiki-live-preview-block',
									'.shiki-reading-block',
									'.shiki-line-numbers',
								].join(', '),
							).length
						: 0;
				const sourceInternalLineNumberCount =
					input.mode === 'source' ? scope.querySelectorAll('.shiki-live-preview-line-number, .shiki-line-numbers span').length : 0;
				const sourceBlockScrollRowCount =
					input.mode === 'source' ? scope.querySelectorAll('.shiki-block-scroll-row[data-shiki-block-id], .shiki-source-code-line').length : 0;
				const sourceBlockScrollbarCount = input.mode === 'source' ? scope.querySelectorAll('.shiki-block-horizontal-scrollbar').length : 0;
				const sourceShikiTokenDecorationCount =
					input.mode === 'source'
						? scope.querySelectorAll('.cm-line.HyperMD-codeblock .shiki-source-token, .HyperMD-codeblock .shiki-source-token').length
						: 0;
				const blockIds = new Set<string>();
				for (const element of scope.querySelectorAll<HTMLElement>('[data-shiki-block-id]')) {
					const blockId = element.dataset.shikiBlockId;
					if (blockId) blockIds.add(blockId);
				}

				const blocks = [...blockIds]
					.map(blockId => {
						const escapedBlockId = CSS.escape(blockId);
						const rootElement =
							scope.querySelector<HTMLElement>(`.shiki-reading-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`.shiki-live-preview-block[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`[data-shiki-block-id="${escapedBlockId}"]`);
						if (!rootElement) return null;

						const rows = [...scope.querySelectorAll<HTMLElement>(`.shiki-block-scroll-row[data-shiki-block-id="${escapedBlockId}"]`)];
						const scrollbars = [
							...scope.querySelectorAll<HTMLElement>(`.shiki-block-horizontal-scrollbar[data-shiki-block-id="${escapedBlockId}"]`),
						];
						const body = rootElement.querySelector<HTMLElement>('.shiki-block-body') ?? null;
						const blockElements = [...scope.querySelectorAll<HTMLElement>(`[data-shiki-block-id="${escapedBlockId}"]`)];
						const header =
							scope.querySelector<HTMLElement>(`.shiki-block-header[data-shiki-block-id="${escapedBlockId}"]`) ??
							scope.querySelector<HTMLElement>(`.shiki-live-preview-header[data-shiki-block-id="${escapedBlockId}"]`) ??
							(rootElement.matches('.shiki-block-header, .shiki-live-preview-header') ? rootElement : null);
						const owners = blockElements.filter(element => element.dataset.shikiScrollOwner === 'true');
						const targets = [...rows, ...scrollbars];
						if (body) targets.push(body);

						return {
							blockId,
							root: rootElement,
							blockElements,
							body,
							row: rows[0] ?? null,
							rows,
							scrollbar: scrollbars[0] ?? null,
							scrollbars,
							owners,
							header,
							gutter: rootElement.querySelector<HTMLElement>('.shiki-line-numbers, .shiki-live-preview-line-number') ?? null,
							code: rootElement.querySelector<HTMLElement>('code, pre, .cm-line') ?? rows[0] ?? null,
							targets,
						};
					})
					.filter(entry => entry !== null) as Array<{
					blockId: string;
					root: HTMLElement;
					blockElements: HTMLElement[];
					body: HTMLElement | null;
					row: HTMLElement | null;
					rows: HTMLElement[];
					scrollbar: HTMLElement | null;
					scrollbars: HTMLElement[];
					owners: HTMLElement[];
					header: HTMLElement | null;
					gutter: HTMLElement | null;
					code: HTMLElement | null;
					targets: HTMLElement[];
				}>;

				const blockStates = blocks.map((block, index): HorizontalScrollBlockState => {
					const targets = block.targets;
					const rowScrollLeftValues = block.rows.map(element => element.scrollLeft);
					const rectProbe = block.code ?? block.row ?? block.body ?? block.scrollbar ?? block.root;
					const rootStyle = getComputedStyle(block.root);
					const rowRect = block.row?.getBoundingClientRect() ?? null;
					const rowStyle = block.row ? getComputedStyle(block.row) : null;
					const headerRect = block.header?.getBoundingClientRect() ?? null;
					const headerStyle = block.header ? getComputedStyle(block.header) : null;
					const headerLeftGroupRect = block.header?.querySelector<HTMLElement>('.shiki-header-left')?.getBoundingClientRect() ?? null;
					const headerLangRect = block.header?.querySelector<HTMLElement>('.shiki-lang-name')?.getBoundingClientRect() ?? null;
					const headerCopyRect = block.header?.querySelector<HTMLElement>('.shiki-copy-button')?.getBoundingClientRect() ?? null;
					const beforeCodeLeft = block.code?.getBoundingClientRect().left ?? null;
					const beforeGutterLeft = block.gutter?.getBoundingClientRect().left ?? null;
					const lineNumbers =
						input.mode === 'reading'
							? [...block.root.querySelectorAll<HTMLElement>('.shiki-line-numbers span')]
							: [...scope.querySelectorAll<HTMLElement>(`.shiki-live-preview-line-number[data-shiki-block-id="${CSS.escape(block.blockId)}"]`)];
					const gutterEdge = block.gutter ?? lineNumbers[0] ?? null;
					const lineNumberRect = gutterEdge?.getBoundingClientRect() ?? null;
					const gutterStyle = gutterEdge ? getComputedStyle(gutterEdge) : null;
					const gutterBeforeStyle = gutterEdge ? getComputedStyle(gutterEdge, '::before') : null;
					const gutterAfterStyle = gutterEdge ? getComputedStyle(gutterEdge, '::after') : null;
					const parseCssPixels = (value: string | null | undefined): number => {
						const parsed = Number.parseFloat(value ?? '');
						return Number.isFinite(parsed) ? parsed : 0;
					};
					const lineNumberRects = lineNumbers
						.map(element => element.getBoundingClientRect())
						.filter(rect => rect.width > 0 && rect.height > 0)
						.sort((first, second) => first.top - second.top);
					const gutterMaxVerticalGap =
						lineNumberRects.length > 1
							? lineNumberRects.slice(1).reduce((maxGap, rect, index) => Math.max(maxGap, rect.top - lineNumberRects[index].bottom), 0)
							: 0;
					const gutterRowOverpaint = parseCssPixels(gutterStyle?.getPropertyValue('--shiki-live-preview-gutter-row-overpaint'));
					const rowRects = block.rows
						.map(element => element.getBoundingClientRect())
						.filter(rect => rect.width > 0 && rect.height > 0)
						.sort((first, second) => first.top - second.top);
					const rowMaxVerticalGap =
						rowRects.length > 1 ? rowRects.slice(1).reduce((maxGap, rect, index) => Math.max(maxGap, rect.top - rowRects[index].bottom), 0) : 0;
					const rowOverpaint = parseCssPixels(rowStyle?.getPropertyValue('--shiki-live-preview-row-overpaint'));
					const firstLineNumberTextRect = (() => {
						const firstLineNumber = lineNumbers[0] ?? null;
						const textNode = [...(firstLineNumber?.childNodes ?? [])].find(
							node => node.nodeType === Node.TEXT_NODE && /\S/.test(node.textContent ?? ''),
						);
						if (!textNode) {
							return null;
						}
						const range = document.createRange();
						range.selectNodeContents(textNode);
						const rect = range.getBoundingClientRect();
						range.detach();
						return rect.width > 0 && rect.height > 0 ? rect : null;
					})();
					const contentElements = [
						...scope.querySelectorAll<HTMLElement>(`.shiki-live-preview-code-content[data-shiki-block-id="${CSS.escape(block.blockId)}"]`),
					];
					const visualBlockRightCandidates = [
						block.header?.getBoundingClientRect().right,
						block.scrollbar?.getBoundingClientRect().right,
						block.row?.getBoundingClientRect().right,
						block.root.getBoundingClientRect().right,
					].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
					const blockClipRight = visualBlockRightCandidates.length ? Math.min(...visualBlockRightCandidates) : null;
					const contentVisibility = contentElements.map(element => {
						const style = getComputedStyle(element);
						const textFillColor = style.getPropertyValue('-webkit-text-fill-color');
						const opacity = Number.parseFloat(style.opacity || '1');
						const row = element.closest<HTMLElement>('.shiki-block-scroll-row');
						const rowRect = row?.getBoundingClientRect() ?? block.root.getBoundingClientRect();
						const visibleRect = [...element.getClientRects()]
							.map(rect => ({
								left: Math.max(rect.left, rowRect.left, lineNumberRect?.right ?? rowRect.left),
								right: Math.min(rect.right, rowRect.right),
								top: Math.max(rect.top, rowRect.top),
								bottom: Math.min(rect.bottom, rowRect.bottom),
							}))
							.find(rect => rect.right - rect.left > 2 && rect.bottom - rect.top > 2);
						const hasVisibleStyle =
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							opacity > 0 &&
							style.color !== 'rgba(0, 0, 0, 0)' &&
							textFillColor !== 'rgba(0, 0, 0, 0)';
						let hitTestable = false;
						if (visibleRect && hasVisibleStyle) {
							const x = visibleRect.left + Math.min(10, (visibleRect.right - visibleRect.left) / 2);
							const y = visibleRect.top + (visibleRect.bottom - visibleRect.top) / 2;
							const hit = document.elementFromPoint(x, y);
							hitTestable =
								hit === element ||
								element.contains(hit) ||
								hit?.closest('.shiki-live-preview-code-content') === element ||
								(row !== null && hit?.closest('.shiki-block-scroll-row') === row);
						}
						return {
							hasVisibleRect: visibleRect !== undefined,
							hasVisibleStyle,
							hitTestable,
						};
					});
					const countVisibleGlyphs = (element: HTMLElement): number => {
						const row = element.closest<HTMLElement>('.shiki-block-scroll-row');
						const rowRect = row?.getBoundingClientRect() ?? block.root.getBoundingClientRect();
						const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
						const range = document.createRange();
						let visibleGlyphs = 0;
						let node = walker.nextNode();
						while (node) {
							const text = node.textContent ?? '';
							for (let offset = 0; offset < text.length; offset++) {
								if (!/\S/.test(text[offset] ?? '')) {
									continue;
								}
								range.setStart(node, offset);
								range.setEnd(node, offset + 1);
								const hasVisibleGlyph = [...range.getClientRects()].some(rect => {
									const left = Math.max(rect.left, rowRect.left, lineNumberRect?.right ?? rowRect.left);
									const right = Math.min(rect.right, rowRect.right);
									const top = Math.max(rect.top, rowRect.top);
									const bottom = Math.min(rect.bottom, rowRect.bottom);
									return right - left > 0.5 && bottom - top > 0.5;
								});
								if (hasVisibleGlyph) {
									visibleGlyphs++;
									if (visibleGlyphs >= 8) {
										range.detach();
										return visibleGlyphs;
									}
								}
							}
							node = walker.nextNode();
						}
						range.detach();
						return visibleGlyphs;
					};
					const visibleCodeGlyphCount = contentElements.reduce((count, element) => count + countVisibleGlyphs(element), 0);
					let overflowingCodeGlyphCount = 0;
					let maxCodeGlyphRight: number | null = null;
					for (const element of contentElements) {
						const row = element.closest<HTMLElement>('.shiki-block-scroll-row');
						const rowRect = row?.getBoundingClientRect() ?? block.root.getBoundingClientRect();
						const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
						const range = document.createRange();
						let node = walker.nextNode();
						while (node) {
							const text = node.textContent ?? '';
							for (let offset = 0; offset < text.length; offset++) {
								if (!/\S/.test(text[offset] ?? '')) {
									continue;
								}
								range.setStart(node, offset);
								range.setEnd(node, offset + 1);
								for (const rect of range.getClientRects()) {
									const left = Math.max(rect.left, rowRect.left, lineNumberRect?.right ?? rowRect.left);
									const right = Math.min(rect.right, rowRect.right);
									const top = Math.max(rect.top, rowRect.top);
									const bottom = Math.min(rect.bottom, rowRect.bottom);
									if (right - left <= 0.5 || bottom - top <= 0.5) {
										continue;
									}
									const paintedRight = Math.min(rect.right, rowRect.right);
									maxCodeGlyphRight = Math.max(maxCodeGlyphRight ?? Number.NEGATIVE_INFINITY, paintedRight);
									if (blockClipRight !== null && paintedRight > blockClipRight + 1) {
										overflowingCodeGlyphCount++;
									}
								}
							}
							node = walker.nextNode();
						}
						range.detach();
					}
					const parseZIndex = (value: string | null): number => {
						const parsed = Number.parseInt(value ?? '', 10);
						return Number.isFinite(parsed) ? parsed : 0;
					};
					const contentZIndex = Math.max(0, ...contentElements.map(element => parseZIndex(getComputedStyle(element).zIndex)));
					const gutterZIndex = parseZIndex(gutterStyle?.zIndex ?? null);
					const gutterBeforeZIndex = parseZIndex(gutterBeforeStyle?.zIndex ?? null);
					const gutterAfterZIndex = parseZIndex(gutterAfterStyle?.zIndex ?? null);
					const codeContent =
						input.mode === 'reading'
							? (block.root.querySelector<HTMLElement>('.shiki-code-scroll code') ?? block.code)
							: (contentElements[0] ?? block.code);
					const codeContentLeft = codeContent?.getBoundingClientRect().left ?? null;
					const contentTranslateXValues = contentElements.map(element => {
						const transform = getComputedStyle(element).transform;
						if (!transform || transform === 'none') return 0;
						const matrix = new DOMMatrixReadOnly(transform);
						return matrix.m41;
					});
					const shortLineRow = block.rows.find(row => row.textContent?.includes('shortLineMustScrollWithBlock'));
					const shortLineContent = shortLineRow?.querySelector<HTMLElement>('.shiki-live-preview-code-content');
					const shortLineTransform = shortLineContent ? getComputedStyle(shortLineContent).transform : '';
					const shortLineContentTranslateX =
						!shortLineTransform || shortLineTransform === 'none' ? null : new DOMMatrixReadOnly(shortLineTransform).m41;
					const contentTranslateXSpread = contentTranslateXValues.length
						? Math.max(...contentTranslateXValues) - Math.min(...contentTranslateXValues)
						: 0;
					const effectiveContentScrollLeft = Math.max(0, ...contentTranslateXValues.map(value => -value));
					const visibleRects = block.blockElements.map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
					const blockTop = visibleRects.length ? Math.min(...visibleRects.map(rect => rect.top)) : null;
					const blockBottom = visibleRects.length ? Math.max(...visibleRects.map(rect => rect.bottom)) : null;
					const nativeBlockGutterCount =
						input.mode === 'live-preview' && blockTop !== null && blockBottom !== null
							? [...scope.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')].filter(element => {
									const style = getComputedStyle(element);
									if (style.visibility === 'hidden' || style.display === 'none') return false;
									const rect = element.getBoundingClientRect();
									return rect.bottom > blockTop - 1 && rect.top < blockBottom + 1;
								}).length
							: 0;

					return {
						index,
						blockId: block.blockId,
						text: (block.root.textContent ?? '').slice(0, 240),
						lineNumberCount: lineNumbers.length,
						lineNumberValues: lineNumbers.map(element => element.textContent ?? ''),
						nativeBlockGutterCount,
						gutterMasksScrolledContent:
							input.mode !== 'live-preview' ||
							(gutterStyle !== null &&
								gutterBeforeStyle !== null &&
								gutterAfterStyle !== null &&
								gutterStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
								gutterBeforeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
								gutterAfterStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
								gutterZIndex > contentZIndex &&
								gutterBeforeZIndex > contentZIndex &&
								gutterAfterZIndex > contentZIndex),
						rowCount: block.rows.length,
						scrollbarCount: block.scrollbars.length,
						scrollOwnerCount: block.owners.length,
						rowScrollSurfaceCount: block.rows.filter(element => element.scrollWidth > element.clientWidth).length,
						rowScrollLeftMin: rowScrollLeftValues.length ? Math.min(...rowScrollLeftValues) : 0,
						rowScrollLeftMax: Math.max(0, ...block.rows.map(element => element.scrollLeft)),
						rowScrollLeftValues,
						rowClientWidthValues: block.rows.map(element => element.clientWidth),
						rowScrollWidthValues: block.rows.map(element => element.scrollWidth),
						rowSpacerWidthValues: block.rows.map(element => {
							const value = getComputedStyle(element).getPropertyValue('--shiki-block-scroll-spacer-width').trim();
							const parsed = Number.parseFloat(value);
							return Number.isFinite(parsed) ? parsed : 0;
						}),
						rowTextValues: block.rows.map(element => (element.textContent ?? '').slice(0, 120)),
						livePreviewContentCount: contentElements.length,
						livePreviewContentTranslateXValues: contentTranslateXValues,
						livePreviewContentTranslateXSpread: contentTranslateXSpread,
						visibleCodeContentCount: contentVisibility.filter(result => result.hasVisibleRect && result.hasVisibleStyle).length,
						hitTestableCodeContentCount: contentVisibility.filter(result => result.hitTestable).length,
						visibleCodeGlyphCount,
						overflowingCodeGlyphCount,
						maxCodeGlyphRight,
						blockClipRight,
						transparentCodeContentCount: contentVisibility.filter(result => !result.hasVisibleStyle).length,
						zeroRectCodeContentCount: contentVisibility.filter(result => !result.hasVisibleRect).length,
						hasShortLineContent: shortLineContent !== undefined,
						shortLineRowScrollLeft: shortLineRow?.scrollLeft ?? null,
						shortLineContentTranslateX,
						visibleScrollbarCount: block.scrollbars.filter(element => !element.hidden && getComputedStyle(element).display !== 'none').length,
						disabledScrollbarCount: block.scrollbars.filter(element => element.dataset.shikiScrollDisabled === 'true').length,
						scrollLeft: Math.max(0, ...targets.map(element => element.scrollLeft), effectiveContentScrollLeft),
						maxScrollLeft: Math.max(0, ...targets.map(element => element.scrollWidth - element.clientWidth)),
						clientWidth: rectProbe?.clientWidth ?? 0,
						scrollWidth: rectProbe?.scrollWidth ?? 0,
						headerLeft: headerRect?.left ?? null,
						headerRight: headerRect?.right ?? null,
						headerWidth: headerRect?.width ?? null,
						headerHeight: headerRect?.height ?? null,
						headerDisplay: headerStyle?.display ?? null,
						headerFlexDirection: headerStyle?.flexDirection ?? null,
						headerBorderTopWidth: headerStyle?.borderTopWidth ?? null,
						headerBorderRightWidth: headerStyle?.borderRightWidth ?? null,
						headerBorderLeftWidth: headerStyle?.borderLeftWidth ?? null,
						headerBorderTopColor: headerStyle?.borderTopColor ?? null,
						headerLeftGroupLeft: headerLeftGroupRect?.left ?? null,
						headerLangLeft: headerLangRect?.left ?? null,
						headerLangCenterY: headerLangRect ? headerLangRect.top + headerLangRect.height / 2 : null,
						headerCopyRight: headerCopyRect?.right ?? null,
						headerCopyCenterY: headerCopyRect ? headerCopyRect.top + headerCopyRect.height / 2 : null,
						rowLeft: rowRect?.left ?? null,
						rowRight: rowRect?.right ?? null,
						rowBorderRightWidth: rowStyle?.borderRightWidth ?? null,
						rowBorderLeftWidth: rowStyle?.borderLeftWidth ?? null,
						rowBorderRightColor: rowStyle?.borderRightColor ?? null,
						rootBorderTopWidth: rootStyle.borderTopWidth,
						rootBorderTopColor: rootStyle.borderTopColor,
						gutterBorderRightWidth: gutterStyle?.borderRightWidth ?? null,
						gutterBorderRightColor: gutterStyle?.borderRightColor ?? null,
						gutterMaskBorderLeftWidth: gutterAfterStyle?.borderLeftWidth ?? null,
						gutterMaskBorderLeftColor: gutterAfterStyle?.borderLeftColor ?? null,
						gutterLeft: lineNumberRect?.left ?? beforeGutterLeft,
						gutterRight: lineNumberRect?.right ?? null,
						gutterWidth: lineNumberRect?.width ?? null,
						gutterMinWidth: gutterStyle?.minWidth ?? null,
						gutterPaddingRight: gutterStyle?.paddingRight ?? null,
						gutterMarginRight: gutterStyle?.marginRight ?? null,
						gutterBackgroundColor: gutterStyle?.backgroundColor ?? null,
						gutterColor: gutterStyle?.color ?? null,
						gutterFontFamily: gutterStyle?.fontFamily ?? null,
						gutterFontSize: gutterStyle?.fontSize ?? null,
						gutterLineHeight: gutterStyle?.lineHeight ?? null,
						gutterTextAlign: gutterStyle?.textAlign ?? null,
						gutterJustifyContent: gutterStyle?.justifyContent ?? null,
						gutterBoxSizing: gutterStyle?.boxSizing ?? null,
						gutterMaxVerticalGap,
						gutterVerticalOverpaint: input.mode === 'live-preview' ? gutterRowOverpaint * 2 : null,
						rowMaxVerticalGap,
						rowVerticalOverpaint: input.mode === 'live-preview' ? rowOverpaint * 2 : null,
						firstLineNumberTextRight: firstLineNumberTextRect?.right ?? null,
						firstLineNumberTextCenterY: firstLineNumberTextRect ? firstLineNumberTextRect.top + firstLineNumberTextRect.height / 2 : null,
						codeContentLeft,
						gutterToCodeGap: lineNumberRect && codeContentLeft !== null ? codeContentLeft - lineNumberRect.right : null,
						codeLeft: beforeCodeLeft,
						codeMoved: null,
						gutterMoved: null,
					};
				});

				return {
					label: input.label,
					mode: input.mode,
					activeFile: runtimeApp.workspace.getActiveFile?.()?.path ?? null,
					isMobile: runtimeApp.isMobile,
					wrapLines: plugin?.loadedSettings?.wrapLines ?? null,
					showLineNumbers: plugin?.loadedSettings?.showLineNumbers ?? null,
					noteScrollLeft: noteScroller?.scrollLeft ?? 0,
					documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
					blockCount: blockStates.length,
					rawFenceVisible: activeText.includes('```ts'),
					monacoEditorCount: root.querySelectorAll('.monaco-editor').length,
					sourceNativeGutterCount,
					sourceRenderedBlockChromeCount,
					sourceInternalLineNumberCount,
					sourceBlockScrollRowCount,
					sourceBlockScrollbarCount,
					sourceShikiTokenDecorationCount,
					blocks: blockStates,
				};
			},
			{ mode, label },
		);
	}

	private async waitForMode(mode: HorizontalScrollMode, notePath: string): Promise<void> {
		await browser.waitUntil(
			async () =>
				executeObsidian(
					({ app }, input) => {
						const runtimeApp = app as unknown as RuntimeApp;
						const root =
							runtimeApp.workspace.activeLeaf?.view?.containerEl ??
							runtimeApp.workspace.activeLeaf?.view?.contentEl ??
							document.querySelector('.workspace-leaf.mod-active');
						if (runtimeApp.workspace.getActiveFile?.()?.path !== input.notePath || !root) return false;
						if (input.mode === 'reading') return !!root.querySelector('.markdown-preview-view');
						if (input.mode === 'source') return !!root.querySelector('.markdown-source-view.mod-cm6:not(.is-live-preview)');
						return !!root.querySelector('.markdown-source-view.mod-cm6.is-live-preview');
					},
					{ mode, notePath },
				),
			{ timeout: 30000, timeoutMsg: `${notePath} did not open in ${mode}` },
		);
	}
}

export const horizontalScrollPage = new HorizontalScrollPage();
