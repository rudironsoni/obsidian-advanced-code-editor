import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CodeBlockRegistry } from 'packages/obsidian/src/codeblocks/CodeBlockRegistry';
import { resolveCm6SourcePath } from 'packages/obsidian/src/codemirror/Cm6_ViewContext';
import { createLivePreviewStructureExtension } from 'packages/obsidian/src/modes/LivePreviewStructureExtension';
import './happydom';

function createPluginMock() {
	const activeContainer = document.createElement('div');
	activeContainer.createDiv({ cls: 'markdown-source-view mod-cm6 is-live-preview' });

	return {
		app: {
			workspace: {
				activeLeaf: {
					view: {
						containerEl: activeContainer,
					},
				},
				getActiveFile: () => ({ path: 'Blank row.md' }),
			},
		},
		codeBlockRegistry: new CodeBlockRegistry(),
		loadedSettings: {
			wrapLines: false,
			showLineNumbers: true,
		},
	};
}

describe('Live Preview structure extension', () => {
	test('does not create empty mark decorations for blank code rows', () => {
		const plugin = createPluginMock();

		expect(() =>
			EditorState.create({
				doc: ['```ts', 'const before = true;', '', 'const after = true;', '```'].join('\n'),
				extensions: [createLivePreviewStructureExtension(plugin as never)],
			}),
		).not.toThrow();
	});

	test('does not rebuild structure decorations for empty transactions', () => {
		const plugin = createPluginMock();
		let createModelCalls = 0;
		const createModel = plugin.codeBlockRegistry.createModel.bind(plugin.codeBlockRegistry);
		plugin.codeBlockRegistry.createModel = (input): ReturnType<typeof createModel> => {
			createModelCalls++;
			return createModel(input);
		};
		const parent = document.createElement('div');
		const view = new EditorView({
			parent,
			state: EditorState.create({
				doc: ['```ts', 'const before = true;', '```'].join('\n'),
				extensions: [createLivePreviewStructureExtension(plugin as never)],
			}),
		});

		expect(createModelCalls).toBe(1);
		view.dispatch(view.state.update({}));
		expect(createModelCalls).toBe(1);
		view.destroy();
	});

	test('keeps live preview fence text editable instead of replacing it with widgets', () => {
		const plugin = createPluginMock();
		const parent = document.createElement('div');
		const view = new EditorView({
			parent,
			state: EditorState.create({
				doc: ['```ts', 'const value = true;', '```'].join('\n'),
				extensions: [createLivePreviewStructureExtension(plugin as never)],
			}),
		});

		try {
			const fenceText = [...view.dom.querySelectorAll<HTMLElement>('.shiki-live-preview-fence-text')].map(element => element.textContent);

			expect(fenceText).toEqual(['```ts', '```']);
			expect(view.dom.querySelector('.shiki-live-preview-fence-line .cm-widgetBuffer')).toBeNull();
		} finally {
			view.destroy();
		}
	});

	test('keeps Obsidian native note gutters visible', () => {
		const livePreviewAdapter = readFileSync(new URL('../packages/obsidian/src/modes/LivePreviewAdapter.ts', import.meta.url), 'utf8');
		const structure = readFileSync(new URL('../packages/obsidian/src/modes/LivePreviewStructureExtension.ts', import.meta.url), 'utf8');
		const styles = readFileSync(new URL('../packages/obsidian/src/styles.css', import.meta.url), 'utf8');

		expect(structure).toContain('createBlockHorizontalScrollSpacerDecoration');
		expect(livePreviewAdapter).not.toContain('fencedBlockLineNumbers');
		expect(livePreviewAdapter).not.toContain('gutter.classList.add(LivePreviewAdapter.HIDDEN_GUTTER_CLASS)');
		expect(styles).not.toContain('.cm-lineNumbers .cm-gutterElement.shiki-gutter-line-hidden');
	});

	test('resolves source path from the leaf containing the CM6 view', () => {
		const activeContainer = document.createElement('div');
		const visibleContainer = document.createElement('div');
		const sourceRoot = visibleContainer.createDiv({ cls: 'markdown-source-view mod-cm6' });
		const editorParent = sourceRoot.createDiv();
		document.body.appendChild(visibleContainer);
		const view = new EditorView({
			parent: editorParent,
			state: EditorState.create({ doc: '```ts\nconst value = true;\n```' }),
		});
		const plugin = {
			app: {
				workspace: {
					activeLeaf: { view: { containerEl: activeContainer, file: { path: 'Active.md' } } },
					getActiveFile: () => ({ path: 'Active.md' }),
					iterateAllLeaves: (callback: (leaf: unknown) => void): void => {
						callback({ view: { containerEl: activeContainer, file: { path: 'Active.md' } } });
						callback({ view: { containerEl: visibleContainer, file: { path: 'Visible.md' } } });
					},
				},
			},
		};

		try {
			expect(resolveCm6SourcePath(plugin as never, view)).toBe('Visible.md');
		} finally {
			view.destroy();
			visibleContainer.remove();
		}
	});
});
