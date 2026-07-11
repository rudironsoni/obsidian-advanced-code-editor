import { describe, expect, test } from 'bun:test';
import { findReadingCodeElements } from 'packages/obsidian/src/codeblocks/ReadingCodeElementDiscovery';

function createRenderedBlock(): { section: HTMLElement; pre: HTMLElement; code: HTMLElement; token: HTMLElement } {
	const section = document.createElement('section');
	const pre = section.createEl('pre');
	const code = pre.createEl('code');
	const token = code.createSpan({ text: 'const value = true;' });
	return { section, pre, code, token };
}

describe('Reading code element discovery', () => {
	test('finds the same code element from every Obsidian postprocessor root shape', () => {
		const { section, pre, code, token } = createRenderedBlock();

		for (const root of [section, pre, code, token]) {
			expect([...findReadingCodeElements(root)]).toEqual([code]);
		}
	});

	test('finds and deduplicates multiple rendered blocks under one section', () => {
		const first = createRenderedBlock();
		const second = createRenderedBlock();
		first.section.appendChild(second.pre);

		expect([...findReadingCodeElements(first.section)]).toEqual([first.code, second.code]);
	});
});
