import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	createBlockHorizontalScrollPlugin,
	SHIKI_BLOCK_SCROLL_ROW_CLASS,
	stableBlockScrollMemoryKey,
} from 'packages/obsidian/src/codemirror/BlockHorizontalScroll';
import './happydom';

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function defineLayout(element: HTMLElement, layout: { clientWidth: number; scrollWidth: number }): void {
	Object.defineProperty(element, 'clientWidth', { configurable: true, get: () => layout.clientWidth });
	Object.defineProperty(element, 'scrollWidth', { configurable: true, get: () => layout.scrollWidth });
}

function defineRect(element: HTMLElement, rect: { left: number; right: number; top: number; bottom: number }): void {
	element.getBoundingClientRect = () =>
		({
			...rect,
			x: rect.left,
			y: rect.top,
			width: rect.right - rect.left,
			height: rect.bottom - rect.top,
			toJSON: () => rect,
		}) as DOMRect;
}

function dispatchTouch(dispatchTarget: EventTarget, type: string, clientX: number, clientY: number, touchTarget = dispatchTarget, identifier = 1): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	const touch = { clientX, clientY, identifier, target: touchTarget } as Touch;
	const changedTouches = {
		length: 1,
		item: (index: number) => (index === 0 ? touch : null),
		0: touch,
	} as unknown as TouchList;
	for (const property of ['changedTouches', 'targetTouches', 'touches']) {
		Object.defineProperty(event, property, {
			configurable: true,
			value: changedTouches,
		});
	}
	dispatchTarget.dispatchEvent(event);
	return event;
}

async function waitForBlockScrollMeasure(view: EditorView): Promise<void> {
	await Promise.resolve();
	await new Promise<void>(resolve => {
		view.requestMeasure({
			read: () => null,
			write: () => resolve(),
		});
	});
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function prepareCodeRows(view: EditorView, blockId: string, rowCount: number, layout = { clientWidth: 300, scrollWidth: 1000 }): HTMLElement[] {
	const rows = [...view.dom.querySelectorAll<HTMLElement>('.cm-line')].slice(0, rowCount);
	if (rows.length !== rowCount) {
		throw new Error(`Expected ${rowCount} CodeMirror rows, found ${rows.length}`);
	}
	for (const row of rows) {
		row.classList.add(SHIKI_BLOCK_SCROLL_ROW_CLASS, 'shiki-live-preview-code-line');
		row.dataset.shikiBlockId = blockId;
		defineLayout(row, layout);
	}
	return rows;
}

describe('block horizontal scroll identity', () => {
	test('keeps the same mounted block key when code edits change the content hash', () => {
		const beforeEdit = 'Note.md::live-preview::5::120::5::ts::57949d21';
		const afterEdit = 'Note.md::live-preview::5::120::5::ts::30381156';

		expect(stableBlockScrollMemoryKey(beforeEdit)).toBe(stableBlockScrollMemoryKey(afterEdit));
		expect(stableBlockScrollMemoryKey(beforeEdit)).toBe('Note.md::live-preview::5::120::5::ts');
	});

	test('keeps different blocks and modes independent', () => {
		expect(stableBlockScrollMemoryKey('Note.md::live-preview::5::120::5::ts::57949d21')).not.toBe(
			stableBlockScrollMemoryKey('Note.md::live-preview::12::340::12::ts::57949d21'),
		);
		expect(stableBlockScrollMemoryKey('Note.md::live-preview::5::120::5::ts::57949d21')).not.toBe(
			stableBlockScrollMemoryKey('Note.md::source::5::120::5::ts::57949d21'),
		);
	});

	test('observes inserted scroll targets without measuring every editor update', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const updateBody = source.match(/update\(update: ViewUpdate\): void \{([\s\S]*?)\n\t\t\t\}/)?.[1] ?? '';

		expect(source).toContain('new MutationObserver(this.onDomMutations)');
		expect(source).toContain('this.domObserver.observe(this.view.dom, { childList: true, subtree: true })');
		expect(source).toContain('this.domObserver.disconnect()');
		expect(source).toContain('new ResizeObserver(this.onResize)');
		expect(source).toContain('this.observeResizeTarget(this.view.scrollDOM)');
		expect(source).toContain('this.resizeObserver?.disconnect()');
		expect(source).toContain('this.scheduleMeasure();');
		expect(source).toContain('if (update.docChanged || update.viewportChanged || update.geometryChanged)');
		expect(updateBody.trim().endsWith('this.scheduleMeasure();\n\t\t\t\t}')).toBe(true);
	});

	test('skips no-op DOM writes during scroll sync', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');

		expect(source).toContain('if (target.scrollLeft !== scrollLeft)');
		expect(source).toContain('if (target.style.getPropertyValue(property) !== value)');
	});

	test('does not return to transform-based content scrolling', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');

		expect(source).toContain('for (const row of cache.rows)');
		expect(source).toContain('this.setScrollLeft(row, scrollLeft)');
		expect(source).not.toContain('this.styleElement = this.view.dom.ownerDocument.createElement');
		expect(source).not.toContain('.shiki-live-preview-code-content[data-shiki-block-id=${CSS.escape(blockId)}]');
		expect(source).not.toContain("content.style.setProperty('--shiki-block-scroll-left', offset)");
		expect(source).not.toContain("this.setStyleProperty(row, '--shiki-block-scroll-left'");
	});

	test('uses CodeMirror gesture handlers and requestMeasure for scroll ownership', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const main = read('packages/obsidian/src/main.ts');
		const cm6 = read('packages/obsidian/src/codemirror/Cm6_ViewPlugin.ts');

		expect(main).toContain('this.registerEditorExtension([createCm6Plugin(this)])');
		expect(cm6).toContain('createBlockHorizontalScrollPlugin()');
		expect(cm6).toContain('return Prec.highest([createLivePreviewStructureExtension(plugin), createBlockHorizontalScrollPlugin(), cm6Plugin])');
		expect(source).toContain('eventHandlers: {');
		expect(source).toContain('wheel(event)');
		expect(source).toContain('pointerdown(event)');
		expect(source).toContain('pointermove(event)');
		expect(source).toContain('touchstart(event)');
		expect(source).toContain('touchmove(event)');
		expect(source).toContain('this.view.requestMeasure({');
		expect(source).toContain('read: () => this.readBlockScrollMeasures()');
		expect(source).toContain('write: measures =>');
		expect(source).toContain("target.addEventListener('scroll', this.onScroll)");
		expect(source).toContain("target.removeEventListener('scroll', this.onScroll)");
		expect(source).toContain('this.syncObservedScrollTargets(nextScrollTargets)');
		expect(source).not.toContain('document.addEventListener');
		expect(source).not.toContain('window.addEventListener');
		expect(source).not.toContain('gestureRoot.addEventListener');
		expect(source).not.toContain("view.scrollDOM.addEventListener('wheel'");
		expect(source).not.toContain("view.scrollDOM.addEventListener('scroll'");
		expect(source).not.toContain('setTimeout(() =>');
	});

	test('keeps observer callbacks to measurement scheduling only', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const mutationBody = source.match(/private readonly onDomMutations = \(records: MutationRecord\[\]\): void => \{([\s\S]*?)\n\t\t\t\};/)?.[1] ?? '';
		const resizeBody = source.match(/private readonly onResize = \(\): void => \{([\s\S]*?)\n\t\t\t\};/)?.[1] ?? '';
		const observerBody = `${mutationBody}\n${resizeBody}`;

		expect(mutationBody).toContain('this.scheduleMeasure();');
		expect(resizeBody.trim()).toBe('this.scheduleMeasure();');
		for (const forbidden of [
			'scrollWidth',
			'clientWidth',
			'getBoundingClientRect',
			'applyBlockScroll',
			'syncBlock',
			'updateRowScrollSpacers',
			'setStyleProperty',
			'setScrollLeft',
		]) {
			expect(observerBody).not.toContain(forbidden);
		}
	});

	test('keeps layout reads and spacer writes out of scroll hot paths', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const methodBody = (name: string) =>
			source.match(new RegExp(`${name}[^=]*= \\([^)]*\\)[^=]*=> \\{([\\s\\S]*?)\\n\\t\\t\\t\\};`))?.[1] ??
			source.match(new RegExp(`private ${name}[^\\{]*\\{([\\s\\S]*?)\\n\\t\\t\\t\\}`))?.[1] ??
			'';
		const hotPath = [
			methodBody('onWheel'),
			methodBody('onPointerMove'),
			methodBody('onTouchMove'),
			methodBody('onScroll'),
			methodBody('syncGestureBlock'),
			methodBody('syncBlockImmediate'),
			methodBody('applyBlockScroll'),
		].join('\n');

		for (const forbidden of ['scrollWidth', 'clientWidth', 'getBoundingClientRect', 'refreshBlockCache', 'measureScrollbars', 'requestMeasure']) {
			expect(hotPath).not.toContain(forbidden);
		}
		expect(methodBody('applyBlockScroll')).not.toContain('updateRowScrollSpacers');
		expect(source).not.toContain('insertRule');
		expect(source).not.toContain('CSSStyleSheet');
		expect(source).not.toContain('will-change');
		expect(source).not.toContain('--shiki-block-scroll-left');
		expect(source).not.toContain('style.transform');
	});

	test('clamps native row scroll instead of ignoring it', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const rowScrollBranch = source.match(/if \(source\.classList\.contains\(SHIKI_BLOCK_SCROLL_ROW_CLASS\)\) \{([\s\S]*?)\n\t\t\t\t\}/)?.[1] ?? '';

		expect(rowScrollBranch).toContain('this.clampBlockScrollLeft(blockId, source.scrollLeft)');
		expect(rowScrollBranch).toContain('this.setScrollLeft(source, scrollLeft)');
		expect(rowScrollBranch).toContain('this.syncBlockImmediate(blockId, scrollLeft)');
		expect(rowScrollBranch.trim()).not.toBe('return;');
	});

	test('gives every row the shared block scroll width', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const styles = read('packages/obsidian/src/styles.css');

		expect(source).toContain("this.setStyleProperty(row, '--shiki-block-scroll-spacer-width',");
		expect(source).toContain("this.setStyleProperty(row, '--shiki-block-clip-width',");
		expect(source).toContain("this.setStyleProperty(header, '--shiki-block-clip-width',");
		expect(source).toContain('this.updateRowScrollSpacers(cache)');
		expect(source).toContain('const rowScrollWidths = rows.map(row => row.scrollWidth)');
		expect(source).toContain('const clipWidths = scrollbarClientWidths.filter(width => width > 0)');
		expect(source).toContain('storedScrollLeft !== undefined && storedScrollLeft > measure.maxScrollLeft');
		expect(source).toContain('this.scrollLeftByBlock.set(memoryKey, measure.maxScrollLeft)');
		expect(source).toContain('this.resizeObserver?.observe(target)');
		expect(source).not.toContain('const clipWidths = [...scrollbars, ...headers]');
		expect(source).not.toContain("querySelectorAll<HTMLElement>('.shiki-live-preview-code-content')).map(element => element.scrollWidth)");
		expect(source).toContain('cache.disabled ? 0 : cache.maxScrollWidth');
		expect(source).not.toContain('rowNaturalScrollWidths');
		expect(source).toContain('SHIKI_BLOCK_SCROLL_SPACER_CLASS');
		expect(styles).toContain('.cm-line.shiki-block-scroll-row:not(.shiki-live-preview-code-line)::after');
		expect(styles).toContain('.shiki-block-scroll-spacer');
		expect(styles).toContain('width: var(--shiki-block-clip-width, 100%)');
		expect(styles).toContain('.markdown-source-view.mod-cm6.is-live-preview .shiki-live-preview-header');
		expect(styles).toContain('width: var(--shiki-block-clip-width, 100%);');
		expect(styles).toContain('min-width: var(--shiki-block-clip-width, 100%);');
		expect(styles).toContain('max-width: var(--shiki-block-clip-width, 100%);');
		expect(styles).toContain('display: flex !important;');
		expect(styles).toContain('flex-direction: row;');
		expect(styles).toContain('.shiki-header-right');
		expect(styles).toContain('margin-left: auto;');
		expect(styles).toContain('padding-inline-end: 0 !important');
		expect(styles).toContain('var(--shiki-block-scroll-spacer-width, 0px)');
		expect(styles).not.toContain('--shiki-block-scroll-width');
		expect(styles).not.toContain('transform: translateX(calc(-1 * var(--shiki-block-scroll-left, 0px)))');
	});

	test('joins a visible scrollbar to its closing fence', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'long\n```',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::closing-fence';
		const [codeRow, closingFence] = [...view.dom.querySelectorAll<HTMLElement>('.cm-line')];
		const scrollbar = document.createElement('div');

		codeRow.classList.add(SHIKI_BLOCK_SCROLL_ROW_CLASS, 'shiki-live-preview-code-line');
		codeRow.dataset.shikiBlockId = blockId;
		defineLayout(codeRow, { clientWidth: 300, scrollWidth: 1000 });
		closingFence.classList.add('shiki-live-preview-closing-fence-line');
		closingFence.dataset.shikiBlockId = blockId;
		scrollbar.className = 'shiki-block-horizontal-scrollbar';
		scrollbar.dataset.shikiBlockId = blockId;
		defineLayout(scrollbar, { clientWidth: 300, scrollWidth: 1000 });
		view.dom.appendChild(scrollbar);

		try {
			await waitForBlockScrollMeasure(view);

			expect(scrollbar.hidden).toBe(false);
			expect(closingFence.classList.contains('shiki-live-preview-closing-fence-has-scrollbar')).toBe(true);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('shares Reading mode gutter tokens with Live Preview line numbers', () => {
		const styles = read('packages/obsidian/src/styles.css');
		const readingGutterRule = styles.match(/\.shiki-line-numbers \{([\s\S]*?)\n\}/)?.[1] ?? '';
		const livePreviewLineNumberRule =
			styles.match(/(?:^|\n)\.markdown-source-view\.mod-cm6\.is-live-preview \.shiki-live-preview-line-number \{([\s\S]*?)\n\}/)?.[1] ?? '';
		const livePreviewEditorFontLineNumberRule =
			styles.match(
				/body\.shiki-use-editor-font-size \.markdown-source-view\.mod-cm6\.is-live-preview \.shiki-live-preview-line-number \{([\s\S]*?)\n\}/,
			)?.[1] ?? '';

		for (const token of ['--shiki-gutter-background', '--shiki-gutter-code-gap', '--shiki-gutter-min-width', '--shiki-gutter-padding-right']) {
			expect(styles).toContain(token);
		}
		expect(readingGutterRule).toContain('min-width: var(--shiki-gutter-min-width)');
		expect(readingGutterRule).toContain('padding-right: var(--shiki-gutter-padding-right)');
		expect(readingGutterRule).toContain('background: var(--shiki-gutter-background)');
		expect(readingGutterRule).toContain('color: var(--shiki-gutter-text-color)');
		expect(styles).toContain('padding-left: var(--shiki-gutter-code-gap);');
		expect(livePreviewLineNumberRule).toContain('min-width: var(--shiki-gutter-min-width)');
		expect(livePreviewLineNumberRule).toContain('padding-right: var(--shiki-gutter-padding-right)');
		expect(livePreviewLineNumberRule).toContain('margin-right: var(--shiki-gutter-code-gap)');
		expect(livePreviewLineNumberRule).toContain('background-color: var(--shiki-gutter-background)');
		expect(livePreviewLineNumberRule).toContain('color: var(--shiki-gutter-text-color)');
		expect(styles).toContain('width: var(--shiki-gutter-code-gap);');
		expect(livePreviewEditorFontLineNumberRule).toContain('font-size: calc(var(--font-text-size) * 0.875)');
	});

	test('uses the selected Shiki background for code block gutters', () => {
		const readingView = read('packages/obsidian/src/modes/ReadingViewAdapter.ts');
		const livePreview = read('packages/obsidian/src/modes/LivePreviewAdapter.ts');

		expect(readingView).toContain("blockRoot?.style.setProperty('--shiki-code-background', themeBackground)");
		expect(readingView).toContain("blockRoot?.style.setProperty('--shiki-gutter-background', themeBackground)");
		expect(livePreview).toContain("sourceViewRoot.style.setProperty('--shiki-code-background', result.themeBackground)");
		expect(livePreview).toContain("sourceViewRoot.style.setProperty('--shiki-gutter-background', result.themeBackground)");
		expect(livePreview).toContain("sourceViewRoot.style.removeProperty('--shiki-code-background')");
		expect(livePreview).toContain("sourceViewRoot.style.removeProperty('--shiki-gutter-background')");
	});

	test('does not paint-contain Live Preview code rows', () => {
		const styles = read('packages/obsidian/src/styles.css');
		const livePreviewCodeLineRule =
			styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \.cm-line\.shiki-live-preview-code-line \{([\s\S]*?)\n\}/)?.[1] ?? '';

		expect(livePreviewCodeLineRule).toContain('overflow-x: hidden');
		expect(livePreviewCodeLineRule).toContain('clip-path: inset(0)');
		expect(livePreviewCodeLineRule).not.toContain('contain: paint');
	});

	test('lets Live Preview handle horizontal touch pan inside blocks on mobile', () => {
		const styles = read('packages/obsidian/src/styles.css');
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');
		const livePreviewRootRule = styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \{([\s\S]*?)\n\}/)?.[1] ?? '';
		const livePreviewCodeLineRule =
			styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \.cm-line\.shiki-live-preview-code-line \{([\s\S]*?)\n\}/)?.[1] ?? '';
		const livePreviewCodeContentRule =
			styles.match(
				/\.markdown-source-view\.mod-cm6\.is-live-preview \.cm-line\.shiki-live-preview-code-line \.shiki-live-preview-code-content \{([\s\S]*?)\n\}/,
			)?.[1] ?? '';
		const livePreviewScrollerRule = styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \.cm-scroller \{([\s\S]*?)\n\}/)?.[1] ?? '';
		const livePreviewContentRule = styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \.cm-content \{([\s\S]*?)\n\}/)?.[1] ?? '';
		const livePreviewLineNumberRule =
			styles.match(/(?:^|\n)\.markdown-source-view\.mod-cm6\.is-live-preview \.shiki-live-preview-line-number \{([\s\S]*?)\n\}/)?.[1] ?? '';

		expect(livePreviewRootRule).not.toContain('touch-action');
		expect(livePreviewCodeLineRule).toContain('overflow-x: hidden');
		expect(livePreviewCodeLineRule).toContain('touch-action: pan-y pinch-zoom');
		expect(livePreviewCodeLineRule).toContain('scrollbar-width: none');
		expect(livePreviewCodeLineRule).toContain('-webkit-overflow-scrolling: touch');
		expect(livePreviewCodeContentRule).toContain('touch-action: pan-y pinch-zoom');
		expect(livePreviewScrollerRule).not.toContain('touch-action');
		expect(livePreviewContentRule).not.toContain('touch-action');
		expect(livePreviewLineNumberRule).toContain('touch-action: pan-y pinch-zoom');
		expect(livePreviewRootRule).not.toContain('touch-action: pan-x pan-y');
		expect(livePreviewCodeLineRule).not.toContain('touch-action: pan-x pan-y');
		expect(source).toContain('readonly onPointerDown = (event: PointerEvent): boolean | void => {');
		expect(source).toContain('readonly onTouchStart = (event: TouchEvent): boolean | void => {');
		expect(source).toContain('eventHandlers: {');
		expect(source).toContain('touchmove(event)');
		expect(source).toContain('pointermove(event)');
		expect(source).not.toContain("target.addEventListener('touchmove', this.onTouchMove");
		expect(source).not.toContain("target.addEventListener('pointermove', this.onPointerMove");
		expect(source).toContain('this.touchId = touch.identifier;');
		expect(source).toContain('const touch = this.findTouch(event.changedTouches, this.touchId);');
		expect(source).toContain('this.cancelHorizontalGesture(event);');
		expect(source).toContain('event.stopImmediatePropagation();');
		expect(source).toContain('private applyHorizontalGestureScroll(blockId: string, scrollLeft: number, immediate: boolean): void {');
		expect(source).toContain('this.pointerCaptureTarget?.setPointerCapture(event.pointerId);');
		expect(source).toContain('this.pointerCaptureTarget?.releasePointerCapture(this.pointerId);');
		expect(source).toContain('private syncBlockImmediate(blockId: string, scrollLeft: number): void {');
		expect(source).toContain('private syncGestureBlock(blockId: string, scrollLeft: number): void {');
		expect(source).toContain("private gestureInput: 'pointer' | 'touch' | undefined;");
		expect(source).toContain("if (this.gestureInput === 'pointer')");
		expect(source).toContain('this.queueGestureBlock(blockId, nextScrollLeft);');
		expect(source).toContain('this.applyHorizontalGestureScroll(this.pointerBlockId, this.pointerStartScrollLeft - deltaX, false);');
		expect(source).toContain('this.applyHorizontalGestureScroll(this.touchBlockId, this.touchStartScrollLeft - deltaX, false);');
		expect(source).toContain('this.applyBlockScroll(blockId, nextScrollLeft);');
	});

	test('moves every Live Preview row on the next frame of a horizontal touch gesture', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'long\nshort',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::abc123';
		const [longRow, shortRow] = prepareCodeRows(view, blockId, 2);
		const content = document.createElement('span');

		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'longLineThatReceivesTheFinger';
		await waitForBlockScrollMeasure(view);
		longRow.appendChild(content);

		try {
			dispatchTouch(content, 'touchstart', 260, 20);
			const move = dispatchTouch(content, 'touchmove', 60, 22, content);

			expect(move.defaultPrevented).toBe(true);
			expect(longRow.scrollLeft).toBe(0);
			expect(shortRow.scrollLeft).toBe(0);

			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

			expect(longRow.scrollLeft).toBe(200);
			expect(shortRow.scrollLeft).toBe(200);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('coalesces repeated touch moves in the same animation frame', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'long\nshort',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::coalesce';
		const [longRow, shortRow] = prepareCodeRows(view, blockId, 2);
		const content = document.createElement('span');

		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'longLineThatReceivesTheFinger';
		await waitForBlockScrollMeasure(view);
		longRow.appendChild(content);

		try {
			dispatchTouch(content, 'touchstart', 260, 20);
			dispatchTouch(content, 'touchmove', 60, 22, content);
			dispatchTouch(content, 'touchmove', 40, 22, content);

			expect(longRow.scrollLeft).toBe(0);
			expect(shortRow.scrollLeft).toBe(0);

			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

			expect(longRow.scrollLeft).toBe(220);
			expect(shortRow.scrollLeft).toBe(220);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('uses pointer events once when the browser also emits touch events', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({ doc: 'long\nshort', extensions: [createBlockHorizontalScrollPlugin()], parent });
		const blockId = 'Note.md::live-preview::5::120::5::ts::pointer-owner';
		const [longRow, shortRow] = prepareCodeRows(view, blockId, 2);
		const content = document.createElement('span');
		const pointerId = 42;

		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'longLineThatReceivesThePointer';
		await waitForBlockScrollMeasure(view);
		longRow.appendChild(content);

		try {
			content.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 260, clientY: 20, pointerId, pointerType: 'touch' }),
			);
			dispatchTouch(content, 'touchstart', 260, 20, content);
			content.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: 160, clientY: 22, pointerId, pointerType: 'touch' }),
			);
			const duplicateTouchMove = dispatchTouch(content, 'touchmove', 60, 22, content);

			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

			expect(duplicateTouchMove.defaultPrevented).toBe(true);
			expect(longRow.scrollLeft).toBe(100);
			expect(shortRow.scrollLeft).toBe(100);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('coalesces repeated wheel gestures in the same animation frame', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'long\nshort',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::wheel-coalesce';
		const [longRow, shortRow] = prepareCodeRows(view, blockId, 2);
		await waitForBlockScrollMeasure(view);

		try {
			longRow.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 200 }));
			longRow.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 20 }));

			expect(longRow.scrollLeft).toBe(200);
			expect(shortRow.scrollLeft).toBe(200);

			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

			expect(longRow.scrollLeft).toBe(220);
			expect(shortRow.scrollLeft).toBe(220);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('flushes pending pointer scroll when the gesture ends', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'long\nshort',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::pointer-flush';
		const [longRow, shortRow] = prepareCodeRows(view, blockId, 2);
		const content = document.createElement('span');
		const pointerId = 42;

		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'longLineThatReceivesThePointer';
		await waitForBlockScrollMeasure(view);
		longRow.appendChild(content);

		try {
			content.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 260, clientY: 20, pointerId, pointerType: 'touch' }),
			);
			content.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: 60, clientY: 22, pointerId, pointerType: 'touch' }),
			);
			content.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, cancelable: true, clientX: 40, clientY: 22, pointerId, pointerType: 'touch' }),
			);

			expect(longRow.scrollLeft).toBe(0);
			expect(shortRow.scrollLeft).toBe(0);

			content.dispatchEvent(
				new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 22, pointerId, pointerType: 'touch' }),
			);

			expect(longRow.scrollLeft).toBe(220);
			expect(shortRow.scrollLeft).toBe(220);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('lets vertical touch gestures inside Live Preview blocks remain native', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'line',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::vertical';
		const [row] = prepareCodeRows(view, blockId, 1);
		const content = document.createElement('span');

		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'verticalDragMustRemainNative';
		await waitForBlockScrollMeasure(view);
		row.appendChild(content);

		try {
			dispatchTouch(content, 'touchstart', 260, 20);
			const move = dispatchTouch(content, 'touchmove', 258, 80, content);

			expect(move.defaultPrevented).toBe(false);
			expect(row.scrollLeft).toBe(0);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('keeps Obsidian mobile edge and gutter gestures outside Live Preview blocks native', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'native\ncode',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::edge';
		const [nativeGutter, row] = [...view.dom.querySelectorAll<HTMLElement>('.cm-line')];
		const content = document.createElement('span');

		nativeGutter.classList.add('cm-gutterElement');
		row.classList.add(SHIKI_BLOCK_SCROLL_ROW_CLASS, 'shiki-live-preview-code-line');
		row.dataset.shikiBlockId = blockId;
		defineLayout(row, { clientWidth: 300, scrollWidth: 1000 });
		defineRect(row, { left: 48, right: 348, top: 12, bottom: 44 });
		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'codeBlockContent';
		await waitForBlockScrollMeasure(view);
		row.appendChild(content);

		try {
			dispatchTouch(nativeGutter, 'touchstart', 8, 24);
			const move = dispatchTouch(nativeGutter, 'touchmove', 180, 26, nativeGutter);

			expect(move.defaultPrevented).toBe(false);
			expect(row.scrollLeft).toBe(0);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('syncs native Live Preview row touch scroll across every row immediately', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'long\nshort',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::native';
		const [longRow, shortRow] = prepareCodeRows(view, blockId, 2);
		await waitForBlockScrollMeasure(view);

		try {
			longRow.scrollLeft = 180;
			longRow.dispatchEvent(new Event('scroll', { bubbles: true }));

			expect(longRow.scrollLeft).toBe(180);
			expect(shortRow.scrollLeft).toBe(180);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('cancels wheel overscroll at Live Preview block boundaries', async () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: 'line',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::wheel-boundary';
		const [row] = prepareCodeRows(view, blockId, 1);
		let bubbledWheelEvents = 0;

		view.scrollDOM.addEventListener('wheel', () => {
			bubbledWheelEvents++;
		});
		await waitForBlockScrollMeasure(view);

		try {
			row.scrollLeft = 700;
			const rightEdgeWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 120 });
			row.dispatchEvent(rightEdgeWheel);

			expect(rightEdgeWheel.defaultPrevented).toBe(true);
			expect(row.scrollLeft).toBe(700);
			expect(bubbledWheelEvents).toBe(0);

			row.scrollLeft = 0;
			const leftEdgeWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: -120 });
			row.dispatchEvent(leftEdgeWheel);

			expect(leftEdgeWheel.defaultPrevented).toBe(true);
			expect(row.scrollLeft).toBe(0);
			expect(bubbledWheelEvents).toBe(0);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('keeps raw Source mode out of rendered block scroll chrome', () => {
		const sourceMode = read('packages/obsidian/src/modes/SourceModeAdapter.ts');
		const styles = read('packages/obsidian/src/styles.css');

		expect(sourceMode).not.toContain('createBlockHorizontalScrollbarDecoration');
		expect(sourceMode).not.toContain('SHIKI_BLOCK_SCROLL_ROW_CLASS');
		expect(sourceMode).not.toContain('shiki-source-code-line');
		expect(sourceMode).not.toContain('data-shiki-block-id');
		expect(styles).not.toContain('.cm-line.shiki-source-code-line');
		expect(styles).not.toContain('.markdown-source-view.mod-cm6:not(.is-live-preview) .cm-scroller');
	});
});
