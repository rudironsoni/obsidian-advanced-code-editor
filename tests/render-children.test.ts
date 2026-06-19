import { describe, expect, test } from 'bun:test';
import { CodeBlock } from 'packages/obsidian/src/CodeBlock';
import { InlineCodeBlock } from 'packages/obsidian/src/InlineCodeBlock';

function createContext(markdown: string): { sourcePath: string; getSectionInfo: () => { text: string; lineStart: number } } {
	return {
		sourcePath: 'note.md',
		getSectionInfo: () => ({ text: markdown, lineStart: 0 }),
	};
}

describe('render children', () => {
	test('CodeBlock calls renderWithMonaco and registers active block', async () => {
		const container = document.createElement('pre');
		const calls: unknown[] = [];
		const active: unknown[] = [];
		const plugin = {
			highlighter: {
				renderWithMonaco: async (...args: unknown[]): Promise<void> => {
					calls.push(args);
					container.textContent = 'rendered';
				},
			},
			addActiveCodeBlock: (block: unknown): void => {
				active.push(block);
			},
			removeActiveCodeBlock: (block: unknown): void => {
				active.splice(active.indexOf(block), 1);
			},
		};
		const codeBlock = new CodeBlock(
			plugin as never,
			container,
			'const x = 1;',
			'ts',
			createContext('```ts title="Meta" showLineNumbers\nconst x = 1;\n```') as never,
		);

		codeBlock.onload();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(active).toEqual([codeBlock]);
		expect(calls).toEqual([['const x = 1;', 'ts', 'title="Meta" showLineNumbers', container]]);

		codeBlock.onunload();
		expect(active).toEqual([]);
		expect(container.textContent).toBe('unloaded shiki code block');
	});

	test('InlineCodeBlock renders tokens and clears on unload', async () => {
		const container = document.createElement('code');
		const active: unknown[] = [];
		const plugin = {
			highlighter: {
				getHighlightTokens: async (): Promise<{ tokens: { content: string; color: string }[][] }> => ({
					tokens: [[{ content: 'const', color: '#fff' }]],
				}),
				renderTokens: (tokens: { content: string }[], parent: HTMLElement): void => {
					for (const token of tokens) parent.createSpan({ text: token.content });
				},
			},
			addActiveCodeBlock: (block: unknown): void => {
				active.push(block);
			},
			removeActiveCodeBlock: (block: unknown): void => {
				active.splice(active.indexOf(block), 1);
			},
		};
		const inline = new InlineCodeBlock(plugin as never, container, 'const x = 1', 'ts', createContext('') as never);

		inline.onload();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(active).toEqual([inline]);
		expect(container.classList.contains('shiki-inline')).toBe(true);
		expect(container.textContent).toBe('const');

		inline.onunload();
		expect(active).toEqual([]);
		expect(container.textContent).toBe('unloaded shiki inline code block');
	});
});
