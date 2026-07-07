import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import type ShikiPlugin from 'packages/obsidian/src/main';

interface ViewWithContainer {
	containerEl?: HTMLElement;
	file?: {
		path?: string;
	};
}

interface LeafLike {
	view?: ViewWithContainer;
}

interface WorkspaceLike {
	activeLeaf?: LeafLike;
	getActiveFile?(): { path?: string } | null;
	iterateAllLeaves?(callback: (leaf: LeafLike) => void): void;
}

export function getCm6SourceViewRoot(view: EditorView): HTMLElement {
	return view.dom.closest<HTMLElement>('.markdown-source-view.mod-cm6') ?? view.dom;
}

export function isLivePreviewState(state: EditorState): boolean | undefined {
	return state.field(editorLivePreviewField, false);
}

export function isCm6LivePreview(view: EditorView, state: EditorState): boolean {
	return isLivePreviewState(state) ?? getCm6SourceViewRoot(view).classList.contains('is-live-preview');
}

export function isActiveLeafLivePreview(plugin: ShikiPlugin): boolean {
	const activeContainer = (plugin.app.workspace as WorkspaceLike).activeLeaf?.view?.containerEl;
	return activeContainer?.querySelector('.markdown-source-view.mod-cm6.is-live-preview') !== null && activeContainer !== undefined;
}

export function resolveCm6SourcePath(plugin: ShikiPlugin, view: EditorView): string {
	const root = getCm6SourceViewRoot(view);
	const workspace = plugin.app.workspace as WorkspaceLike;
	let sourcePath: string | undefined;

	workspace.iterateAllLeaves?.(leaf => {
		if (sourcePath) {
			return;
		}
		const container = leaf.view?.containerEl;
		if (container && (container === root || container.contains(root))) {
			sourcePath = leaf.view?.file?.path;
		}
	});

	return sourcePath ?? workspace.getActiveFile?.()?.path ?? '';
}
