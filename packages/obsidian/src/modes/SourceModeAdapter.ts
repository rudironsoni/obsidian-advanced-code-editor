import { Decoration, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import type ShikiPlugin from 'packages/obsidian/src/main';

export class SourceModeAdapter {
	decorations: DecorationSet = Decoration.none;

	constructor(
		private readonly _plugin: ShikiPlugin,
		private readonly _view: EditorView,
		private readonly _requestDecorationRefresh: () => void,
	) {}

	update(_update: ViewUpdate, _isLivePreview: boolean): void {
		this.decorations = Decoration.none;
	}

	async retokenize(): Promise<void> {
		this.decorations = Decoration.none;
	}

	destroy(): void {
		this.decorations = Decoration.none;
	}
}
