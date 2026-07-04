import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { stableBlockScrollMemoryKey } from 'packages/obsidian/src/codemirror/BlockHorizontalScroll';

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
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
		expect(rowScrollBranch).toContain('this.syncBlock(blockId, scrollLeft)');
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

		expect(livePreviewCodeLineRule).toContain('overflow-x: hidden');
		expect(livePreviewCodeLineRule).toContain('clip-path: inset(0)');
		expect(livePreviewCodeLineRule).not.toContain('contain: paint');
	});
});
