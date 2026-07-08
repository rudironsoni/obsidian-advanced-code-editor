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
	eventCount: number;
	p95DispatchMs: number;
	maxDispatchMs: number;
	maxFrameGapMs: number;
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

				const target = input.mode === 'live-preview' ? (block.row ?? block.scrollbar ?? block.body) : (block.scrollbar ?? block.row ?? block.body);
				if (!target) throw new Error(`Code block ${input.blockIndex + 1} has no touch target`);

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
					hitTargetClassName: hitElement.className,
					hitTargetTouchAction: getComputedStyle(hitElement).touchAction,
				};
			},
			{ mode, blockIndex },
		);

		if (
			!coordinates.touchAction.includes('pan-y') ||
			coordinates.touchAction.includes('pan-x') ||
			!coordinates.hitTargetTouchAction.includes('pan-y') ||
			coordinates.hitTargetTouchAction.includes('pan-x')
		) {
			throw new Error(`Expected horizontal block touch target to reserve horizontal pan for JS: ${JSON.stringify(coordinates)}`);
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
		const metrics = await executeObsidian(
			async ({ app }, input: RepeatedWheelInput): Promise<HorizontalScrollPerformanceMetrics> => {
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
				return {
					eventCount: dispatchDurations.length,
					p95DispatchMs: sortedDurations[p95Index] ?? 0,
					maxDispatchMs: Math.max(0, ...dispatchDurations),
					maxFrameGapMs,
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
				};
			},
			{ mode, blockIndex, frames: 60, deltaX: 24 },
		);
		const state = await this.collectScrollState(mode, 'repeated-wheel-after');
		return { metrics, state };
	}

	async compareLineNumberLayoutWithReading(notePath: string): Promise<HorizontalScrollLineNumberLayoutComparison> {
		await this.resetScrollPositions('live-preview');
		await this.waitForHorizontalScrollReady('live-preview', 1, true);
		const livePreview = await this.collectScrollState('live-preview', 'line-number-layout-live-preview');
		await this.openFixture(notePath, 'reading');
		await this.waitForHorizontalScrollReady('reading', 1, true);
		await this.resetScrollPositions('reading');
		await this.waitForHorizontalScrollReady('reading', 1, true);
		const reading = await this.collectScrollState('reading', 'line-number-layout-reading');
		await this.openFixture(notePath, 'live-preview');
		await this.waitForHorizontalScrollReady('live-preview', 1, true);
		return { livePreview, reading };
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
						gutterLeft: beforeGutterLeft,
						gutterRight: lineNumberRect?.right ?? null,
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
