import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

function read(path: string): string {
	return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('native Live Preview block scrolling', () => {
	test('uses Obsidian code block processors for Live Preview block widgets', () => {
		const main = read('packages/obsidian/src/main.ts');
		const registration = main.match(/async registerCodeBlockProcessors\(\): Promise<void> \{([\s\S]*?)\n\t\}/)?.[1] ?? '';

		expect(registration).toContain('for (const declaredLanguage of languages)');
		expect(registration).toContain("this.registerMarkdownCodeBlockProcessor(\n\t\t\t'',");
		expect(registration).toContain('this.registerMarkdownCodeBlockProcessor(');
		expect(registration).toContain('const language = declaredLanguage || DEFAULT_CODE_BLOCK_LANGUAGE');
		expect(registration).toContain('const codeBlock = new CodeBlock(this, el, source, language, ctx)');
		expect(registration).toContain('ctx.addChild(codeBlock)');
	});

	test('keeps one native overflow owner around the rendered code body', () => {
		const adapter = read('packages/obsidian/src/modes/ReadingViewAdapter.ts');
		const styles = read('packages/obsidian/src/styles.css');
		const bodyRule =
			[...styles.matchAll(/\.shiki-block-body \{([\s\S]*?)\n\}/g)].map(match => match[1] ?? '').find(rule => rule.includes('overflow-x: auto')) ?? '';
		const codeScrollRule =
			[...styles.matchAll(/\.shiki-code-scroll \{([\s\S]*?)\n\}/g)].map(match => match[1] ?? '').find(rule => rule.includes('overflow-x: visible')) ?? '';

		expect(adapter).toContain("body.dataset.shikiScrollOwner = this.plugin.loadedSettings.wrapLines ? 'false' : 'true'");
		expect(adapter).toContain("scroll.dataset.shikiScrollOwner = 'false'");
		expect(bodyRule).toContain('overflow-x: auto');
		expect(bodyRule).toContain('overflow-y: hidden');
		expect(styles).toContain('.shiki-reading-block {\n\twidth: 100%;\n\tmax-width: 100%;\n\tmin-width: 0;\n\tbox-sizing: border-box;');
		expect(bodyRule).toContain('touch-action: pan-x pan-y pinch-zoom');
		expect(bodyRule).toContain('-webkit-overflow-scrolling: touch');
		expect(codeScrollRule).toContain('overflow-x: visible');
		expect(codeScrollRule).not.toContain('overflow-x: auto');
	});

	test('keeps the internal line-number gutter pinned inside the native body scroller', () => {
		const styles = read('packages/obsidian/src/styles.css');
		const lineNumberRule = styles.match(/\.shiki-line-numbers \{([\s\S]*?)\n\}/)?.[1] ?? '';

		expect(lineNumberRule).toContain('position: sticky');
		expect(lineNumberRule).toContain('left: 0');
		expect(lineNumberRule).toContain('flex-shrink: 0');
	});

	test('contains no row-level gesture or scroll synchronization path', () => {
		const production = [
			read('packages/obsidian/src/modes/LivePreviewStructureExtension.ts'),
			read('packages/obsidian/src/modes/LivePreviewAdapter.ts'),
			read('packages/obsidian/src/codemirror/Cm6_ViewPlugin.ts'),
		].join('\n');
		const styles = read('packages/obsidian/src/styles.css');

		expect(production).not.toContain('onTouchMove');
		expect(production).not.toContain('onPointerMove');
		expect(production).not.toContain('pointercancel');
		expect(production).not.toContain('row.scrollLeft');
		expect(production).not.toContain('SHIKI_BLOCK_VISUAL_SCROLL');
		expect(production).not.toContain('createBlockHorizontalScrollPlugin');
		expect(styles).not.toContain('shiki-block-visual-scroll-content');
		expect(styles).not.toContain('--shiki-block-visual-scroll-offset');
	});

	test('keeps raw Source mode out of rendered block chrome', () => {
		const sourceMode = read('packages/obsidian/src/modes/SourceModeAdapter.ts');

		expect(sourceMode).not.toContain('shiki-block-body');
		expect(sourceMode).not.toContain('registerMarkdownCodeBlockProcessor');
		expect(sourceMode).not.toContain('createBlockHorizontalScrollPlugin');
	});
});
