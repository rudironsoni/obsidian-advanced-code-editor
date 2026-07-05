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

function dispatchTouch(dispatchTarget: EventTarget, type: string, clientX: number, clientY: number, touchTarget = dispatchTarget): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'changedTouches', {
		configurable: true,
		value: [{ clientX, clientY, identifier: 1, target: touchTarget }],
	});
	dispatchTarget.dispatchEvent(event);
	return event;
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
		expect(source).toContain('this.applyStoredScrolls();');
		expect(source).toContain('this.scheduleMeasure();');
		expect(source).toContain('if (update.docChanged || update.viewportChanged || update.geometryChanged)');
		expect(updateBody.trim().endsWith('this.rescheduleMeasure();\n\t\t\t\t}')).toBe(true);
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
		expect(source).toContain('this.updateRowScrollSpacers(cache)');
		expect(source).toContain('const naturalScrollWidth = row.scrollWidth');
		expect(source).not.toContain("querySelectorAll<HTMLElement>('.shiki-live-preview-code-content')).map(element => element.scrollWidth)");
		expect(source).toContain('cache.disabled ? 0 : cache.maxScrollWidth');
		expect(source).not.toContain('rowNaturalScrollWidths');
		expect(source).toContain('SHIKI_BLOCK_SCROLL_SPACER_CLASS');
		expect(styles).toContain('.cm-line.shiki-block-scroll-row:not(.shiki-live-preview-code-line)::after');
		expect(styles).toContain('.shiki-block-scroll-spacer');
		expect(styles).toContain('width: var(--shiki-block-clip-width, 100%)');
		expect(styles).toContain('padding-inline-end: 0 !important');
		expect(styles).toContain('var(--shiki-block-scroll-spacer-width, 0px)');
		expect(styles).not.toContain('--shiki-block-scroll-width');
		expect(styles).not.toContain('transform: translateX(calc(-1 * var(--shiki-block-scroll-left, 0px)))');
	});

	test('does not paint-contain Live Preview code rows', () => {
		const styles = read('packages/obsidian/src/styles.css');
		const livePreviewCodeLineRule =
			styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \.cm-line\.shiki-live-preview-code-line \{([\s\S]*?)\n\}/)?.[1] ?? '';

		expect(livePreviewCodeLineRule).toContain('overflow-x: auto');
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
			styles.match(/\.markdown-source-view\.mod-cm6\.is-live-preview \.shiki-live-preview-line-number \{([\s\S]*?)\n\}/)?.[1] ?? '';

		expect(livePreviewRootRule).toContain('touch-action: pan-x pan-y');
		expect(livePreviewCodeLineRule).toContain('overflow-x: auto');
		expect(livePreviewCodeLineRule).toContain('touch-action: pan-x pan-y');
		expect(livePreviewCodeLineRule).toContain('scrollbar-width: none');
		expect(livePreviewCodeContentRule).toContain('touch-action: pan-x pan-y');
		expect(livePreviewScrollerRule).toContain('touch-action: pan-x pan-y');
		expect(livePreviewContentRule).toContain('touch-action: pan-x pan-y');
		expect(livePreviewLineNumberRule).toContain('touch-action: pan-x pan-y');
		expect(source).toContain('private readonly onPointerDown = (event: PointerEvent): void => {');
		expect(source).toContain('private readonly onTouchStart = (event: TouchEvent): void => {');
		expect(source).toContain("this.gestureRoot.addEventListener('touchmove', this.onTouchMove as EventListener, { capture: true, passive: false });");
		expect(source).toContain("this.gestureRoot.addEventListener('pointermove', this.onPointerMove as EventListener, true);");
		expect(source).not.toContain("target.addEventListener('touchmove', this.onTouchMove");
		expect(source).not.toContain("target.addEventListener('pointermove', this.onPointerMove");
		expect(source).toContain('this.syncBlockImmediate(blockId, scrollLeft);');
		expect(source).toContain('this.pointerCaptureTarget?.setPointerCapture(event.pointerId);');
		expect(source).toContain('this.pointerCaptureTarget?.releasePointerCapture(this.pointerId);');
		expect(source).toContain('private syncBlockImmediate(blockId: string, scrollLeft: number): void {');
		expect(source).toContain('this.syncBlockImmediate(this.pointerBlockId, this.pointerStartScrollLeft - deltaX);');
		expect(source).toContain('this.syncBlockImmediate(this.touchBlockId, this.touchStartScrollLeft - deltaX);');
		expect(source).toContain('this.applyBlockScroll(blockId, nextScrollLeft);');
	});

	test('moves every Live Preview row immediately from a horizontal touch gesture', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: '',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::abc123';
		const longRow = document.createElement('div');
		const shortRow = document.createElement('div');
		const content = document.createElement('span');

		for (const row of [longRow, shortRow]) {
			row.className = `${SHIKI_BLOCK_SCROLL_ROW_CLASS} shiki-live-preview-code-line`;
			row.dataset.shikiBlockId = blockId;
			view.scrollDOM.appendChild(row);
			defineLayout(row, { clientWidth: 300, scrollWidth: 1000 });
		}

		content.className = 'shiki-live-preview-code-content';
		content.textContent = 'longLineThatReceivesTheFinger';
		longRow.appendChild(content);

		try {
			dispatchTouch(content, 'touchstart', 260, 20);
			const move = dispatchTouch(document, 'touchmove', 60, 22, content);

			expect(move.defaultPrevented).toBe(false);
			expect(longRow.scrollLeft).toBe(200);
			expect(shortRow.scrollLeft).toBe(200);
		} finally {
			view.destroy();
			parent.remove();
		}
	});

	test('syncs native Live Preview row touch scroll across every row immediately', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const view = new EditorView({
			doc: '',
			extensions: [createBlockHorizontalScrollPlugin()],
			parent,
		});
		const blockId = 'Note.md::live-preview::5::120::5::ts::native';
		const longRow = document.createElement('div');
		const shortRow = document.createElement('div');

		for (const row of [longRow, shortRow]) {
			row.className = `${SHIKI_BLOCK_SCROLL_ROW_CLASS} shiki-live-preview-code-line`;
			row.dataset.shikiBlockId = blockId;
			view.scrollDOM.appendChild(row);
			defineLayout(row, { clientWidth: 300, scrollWidth: 1000 });
		}

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
