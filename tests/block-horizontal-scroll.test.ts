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
		expect(source).toContain('this.applyStoredScrolls();\n\t\t\t\t\tthis.scheduleMeasure();');
		expect(updateBody).toContain('if (update.docChanged || update.viewportChanged || update.geometryChanged)');
		expect(updateBody.trim().endsWith('this.scheduleMeasure();\n\t\t\t\t}')).toBe(true);
	});

	test('skips no-op DOM writes during scroll sync', () => {
		const source = read('packages/obsidian/src/codemirror/BlockHorizontalScroll.ts');

		expect(source).toContain('if (target.scrollLeft !== scrollLeft)');
		expect(source).toContain('if (target.style.getPropertyValue(property) !== value)');
		expect(source).toContain('this.styleElement = this.view.dom.ownerDocument.createElement');
		expect(source).toContain('.shiki-live-preview-code-content[data-shiki-block-id=${CSS.escape(blockId)}]');
		expect(source).not.toContain("row.style.setProperty('--shiki-block-scroll-left', offset)");
		expect(source).not.toContain("content.style.setProperty('--shiki-block-scroll-left', offset)");
	});
});
