import { CodeHighlighter } from 'packages/obsidian/src/Highlighter';
import { createCm6Plugin } from 'packages/obsidian/src/codemirror/Cm6_ViewPlugin';
import { filterHighlightAllPlugin } from 'packages/obsidian/src/PrismPlugin';

export { CodeHighlighter, createCm6Plugin, filterHighlightAllPlugin };

export interface HighlighterEntryModule {
	CodeHighlighter: typeof CodeHighlighter;
	createCm6Plugin: typeof createCm6Plugin;
	filterHighlightAllPlugin: typeof filterHighlightAllPlugin;
}
