import { describe, expect, test } from 'bun:test';
import { CodeBlock } from 'packages/obsidian/src/CodeBlock';
import { InlineCodeBlock } from 'packages/obsidian/src/InlineCodeBlock';
import { normalizeReadingCodeSource } from 'packages/obsidian/src/modes/ReadingViewAdapter';

function createContext(markdown: string): { sourcePath: string; getSectionInfo: () => { text: string; lineStart: number } } {
	return {
		sourcePath: 'note.md',
		getSectionInfo: () => ({ text: markdown, lineStart: 0 }),
	};
}

describe('render children', () => {
	test('CodeBlock uses reading view adapter and registers active block', async () => {
		const container = document.createElement('pre');
		const calls: unknown[] = [];
		const active: unknown[] = [];
		const ctx = createContext('```ts title="Meta" showLineNumbers\nconst x = 1;\n```');
		const plugin = {
			readingViewAdapter: {
				renderBlock: async (...args: unknown[]): Promise<string> => {
					calls.push(args);
					container.textContent = 'rendered';
					return 'block-id';
				},
				disposeBlock: (): void => {
					container.textContent = 'disposed';
				},
			},
			addActiveCodeBlock: (block: unknown): void => {
				active.push(block);
			},
			removeActiveCodeBlock: (block: unknown): void => {
				active.splice(active.indexOf(block), 1);
			},
		};
		const codeBlock = new CodeBlock(plugin as never, container, 'const x = 1;', 'ts', ctx as never);

		codeBlock.onload();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(active).toEqual([codeBlock]);
		expect(calls).toEqual([[container, 'const x = 1;', 'ts', ctx]]);

		codeBlock.onunload();
		expect(active).toEqual([]);
		expect(container.textContent).toBe('unloaded shiki code block');
	});

	test('ReadingViewAdapter strips fence markers when Obsidian section source includes them', () => {
		expect(normalizeReadingCodeSource('```csharp\nList<int[]> intervals = [];\n```')).toBe('List<int[]> intervals = [];');
		expect(normalizeReadingCodeSource('~~~~ts\nconst x = 1;\n~~~~\n')).toBe('const x = 1;');
		expect(normalizeReadingCodeSource('\n\n```csharp\nList<int[]> intervals = [];\n\nList<int[]> mergedIntervals = new();\n```\n')).toBe(
			'List<int[]> intervals = [];\n\nList<int[]> mergedIntervals = new();',
		);
		expect(normalizeReadingCodeSource('\n\n```csharp\nList<int[]> intervals = [];\n```\ntrailing section text')).toBe('List<int[]> intervals = [];');
	});

	test('CodeBlock hands a rendered Live Preview code-line click back to the editor', async () => {
		const sourceRoot = document.createElement('div');
		sourceRoot.className = 'markdown-source-view mod-cm6 is-live-preview';
		const container = sourceRoot.createDiv();
		const setCursorCalls: unknown[] = [];
		let focusCalls = 0;
		const ctx = {
			sourcePath: 'note.md',
			getSectionInfo: () => ({ text: '```ts\nfirst();\nsecond();\n```', lineStart: 4 }),
		};
		const plugin = {
			app: {
				workspace: {
					activeLeaf: {
						view: {
							containerEl: sourceRoot,
							editor: {
								setCursor: (cursor: unknown): void => {
									setCursorCalls.push(cursor);
								},
								focus: (): void => {
									focusCalls++;
								},
							},
						},
					},
				},
			},
			readingViewAdapter: {
				renderBlock: async (): Promise<string> => {
					container.empty();
					container.createDiv({ cls: 'shiki-code-line', text: 'first();' });
					container.createDiv({ cls: 'shiki-code-line', text: 'second();' });
					return 'block-id';
				},
				disposeBlock: (): void => undefined,
			},
			addActiveCodeBlock: (): void => undefined,
			removeActiveCodeBlock: (): void => undefined,
		};
		const codeBlock = new CodeBlock(plugin as never, container, 'first();\nsecond();', 'ts', ctx as never);

		codeBlock.onload();
		await new Promise(resolve => setTimeout(resolve, 0));
		container.querySelectorAll<HTMLElement>('.shiki-code-line')[1]?.click();

		expect(setCursorCalls).toEqual([{ line: 6, ch: 0 }]);
		expect(focusCalls).toBe(1);
		codeBlock.onunload();
	});

	test('ReadingViewAdapter keeps ordinary unfenced code unchanged', () => {
		expect(normalizeReadingCodeSource('List<int[]> intervals = [];\n')).toBe('List<int[]> intervals = [];');
		expect(normalizeReadingCodeSource('const fence = "```";')).toBe('const fence = "```";');
		expect(normalizeReadingCodeSource('const before = true;\n```csharp\nconst sample = true;\n```')).toBe(
			'const before = true;\n```csharp\nconst sample = true;\n```',
		);
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
