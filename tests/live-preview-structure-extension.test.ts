import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'bun:test';
import { CodeBlockRegistry } from 'packages/obsidian/src/codeblocks/CodeBlockRegistry';
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
});
