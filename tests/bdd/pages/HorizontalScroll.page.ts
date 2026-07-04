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
	rowCount: number;
	scrollbarCount: number;
	scrollOwnerCount: number;
	rowScrollSurfaceCount: number;
	rowScrollLeftMax: number;
	livePreviewContentCount: number;
	livePreviewContentTranslateXValues: number[];
	livePreviewContentTranslateXSpread: number;
	visibleScrollbarCount: number;
	disabledScrollbarCount: number;
	scrollLeft: number;
	maxScrollLeft: number;
	clientWidth: number;
	scrollWidth: number;
	headerLeft: number | null;
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
	blocks: HorizontalScrollBlockState[];
};

export type HorizontalScrollPerformanceMetrics = {
	eventCount: number;
	p95DispatchMs: number;
	maxDispatchMs: number;
	maxFrameGapMs: number;
	finalScrollLeft: number;
	rowScrollLeftMax: number;
	noteScrollLeft: number;
	documentScrollLeft: number;
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
							scrollbar: scrollbars[0] ?? null,
						};
					})
					.filter(entry => entry !== null) as Array<{
					root: HTMLElement;
					body: HTMLElement | null;
					row: HTMLElement | null;
					scrollbar: HTMLElement | null;
				}>;
				const block = blocks[input.blockIndex];
				if (!block) throw new Error(`Code block ${input.blockIndex + 1} was not found`);

				const target = block.scrollbar ?? block.row ?? block.body;
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

				const startX = clientX + Math.min(160, target.clientWidth / 2);
				const endX = clientX - Math.min(160, target.clientWidth / 2);
				const pointerId = 41;
				target.dispatchEvent(
					new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: startX, clientY }),
				);
				target.dispatchEvent(
					new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: endX, clientY }),
				);
				target.dispatchEvent(
					new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: endX, clientY }),
				);
			},
			{ mode, blockIndex, gesture },
		);

		await browser.pause(150);
		return this.collectScrollState(mode, `${gesture}-after`);
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

				const target = block.scrollbar ?? block.rows[0];
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
					rowScrollLeftMax: Math.max(0, ...block.rows.map(row => row.scrollLeft)),
					noteScrollLeft: noteScroller?.scrollLeft ?? 0,
					documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
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
							header: rootElement.querySelector<HTMLElement>('.shiki-block-header, .shiki-live-preview-header') ?? null,
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
					const rectProbe = block.code ?? block.row ?? block.body ?? block.scrollbar ?? block.root;
					const beforeCodeLeft = block.code?.getBoundingClientRect().left ?? null;
					const beforeGutterLeft = block.gutter?.getBoundingClientRect().left ?? null;
					const lineNumbers =
						input.mode === 'reading'
							? [...block.root.querySelectorAll<HTMLElement>('.shiki-line-numbers span')]
							: [...scope.querySelectorAll<HTMLElement>(`.shiki-live-preview-line-number[data-shiki-block-id="${CSS.escape(block.blockId)}"]`)];
					const gutterEdge = block.gutter ?? lineNumbers[0] ?? null;
					const lineNumberRect = gutterEdge?.getBoundingClientRect() ?? null;
					const contentElements = [
						...scope.querySelectorAll<HTMLElement>(`.shiki-live-preview-code-content[data-shiki-block-id="${CSS.escape(block.blockId)}"]`),
					];
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
						rowCount: block.rows.length,
						scrollbarCount: block.scrollbars.length,
						scrollOwnerCount: block.owners.length,
						rowScrollSurfaceCount: block.rows.filter(element => element.scrollWidth > element.clientWidth).length,
						rowScrollLeftMax: Math.max(0, ...block.rows.map(element => element.scrollLeft)),
						livePreviewContentCount: contentElements.length,
						livePreviewContentTranslateXValues: contentTranslateXValues,
						livePreviewContentTranslateXSpread: contentTranslateXSpread,
						visibleScrollbarCount: block.scrollbars.filter(element => !element.hidden && getComputedStyle(element).display !== 'none').length,
						disabledScrollbarCount: block.scrollbars.filter(element => element.dataset.shikiScrollDisabled === 'true').length,
						scrollLeft: Math.max(0, ...targets.map(element => element.scrollLeft), effectiveContentScrollLeft),
						maxScrollLeft: Math.max(0, ...targets.map(element => element.scrollWidth - element.clientWidth)),
						clientWidth: rectProbe?.clientWidth ?? 0,
						scrollWidth: rectProbe?.scrollWidth ?? 0,
						headerLeft: block.header?.getBoundingClientRect().left ?? null,
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
