import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { createBlockHorizontalScrollbarDecoration, SHIKI_BLOCK_SCROLL_ROW_CLASS } from 'packages/obsidian/src/codemirror/BlockHorizontalScroll';
import { CodeBlockParser } from 'packages/obsidian/src/codeblocks/CodeBlockParser';
import type { CodeBlockLineInfo, CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';

const SHIKI_LIVE_PREVIEW_CODE_CONTENT_CLASS = 'shiki-live-preview-code-content';

interface LivePreviewStructureState {
	decorations: DecorationSet;
	inputs: LivePreviewStructureInputs;
}

interface LivePreviewStructureInputs {
	isLivePreview: boolean;
	showLineNumbers: boolean;
	sourcePath: string;
	wrapLines: boolean;
}

class ShikiLivePreviewHeaderWidget extends WidgetType {
	constructor(
		private readonly block: CodeBlockModel,
		private readonly plugin: ShikiPlugin,
	) {
		super();
	}

	eq(other: ShikiLivePreviewHeaderWidget): boolean {
		return other.block.id === this.block.id && other.block.language === this.block.language && other.block.code === this.block.code;
	}

	toDOM(): HTMLElement {
		const header = document.createElement('div');
		header.className = 'shiki-live-preview-header shiki-block-header';
		header.dataset.shikiBlockId = this.block.id;
		header.dataset.lang = this.block.language;

		const left = header.createDiv({ cls: 'shiki-header-left' });
		left.createSpan({ cls: 'shiki-lang-name', text: this.block.language });
		const right = header.createDiv({ cls: 'shiki-header-right' });
		const copyBtn = right.createEl('button', { cls: 'shiki-copy-button', text: 'Copy' });
		copyBtn.onclick = (event): void => {
			event.preventDefault();
			event.stopPropagation();
			navigator.clipboard.writeText(this.block.code).catch(() => {});
		};

		return header;
	}

	ignoreEvent(event: Event): boolean {
		return event.target instanceof Element && event.target.closest('.shiki-copy-button') !== null;
	}
}

class ShikiLivePreviewLineNumberWidget extends WidgetType {
	constructor(
		private readonly blockId: string,
		private readonly lineNumber: number,
	) {
		super();
	}

	eq(other: ShikiLivePreviewLineNumberWidget): boolean {
		return other.blockId === this.blockId && other.lineNumber === this.lineNumber;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'shiki-live-preview-line-number';
		span.dataset.shikiBlockId = this.blockId;
		span.textContent = String(this.lineNumber);
		span.setAttribute('aria-hidden', 'true');
		return span;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

class ShikiLivePreviewFenceWidget extends WidgetType {
	constructor(private readonly text: string) {
		super();
	}

	eq(other: ShikiLivePreviewFenceWidget): boolean {
		return other.text === this.text;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'shiki-live-preview-fence-text';
		span.textContent = this.text;
		return span;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function openingFenceText(block: CodeBlockModel): string {
	const fence = block.openingFence ?? '```';
	const meta = block.meta.trim();
	return `${fence}${block.language}${meta ? ` ${meta}` : ''}`;
}

export function createLivePreviewStructureExtension(plugin: ShikiPlugin): Extension {
	const parser = new CodeBlockParser();

	const buildState = (state: EditorState): LivePreviewStructureState => {
		const inputs = readInputs(plugin);
		if (!inputs.isLivePreview) {
			return { decorations: Decoration.none, inputs };
		}
		const lines = collectLines(state);
		const parsed = parser.parseLivePreviewBlocks(lines);
		const ranges: Range<Decoration>[] = [];

		for (const parsedBlock of parsed) {
			const block = plugin.codeBlockRegistry.createModel({
				sourcePath: inputs.sourcePath,
				hostMode: 'live-preview',
				language: parsedBlock.language,
				meta: parsedBlock.meta.raw.trim(),
				code: state.doc.sliceString(parsedBlock.range.charFrom, parsedBlock.range.charTo),
				fenceFrom: state.doc.line(parsedBlock.openingFenceLine).from,
				fenceTo: state.doc.line(parsedBlock.closingFenceLine).to,
				codeFrom: parsedBlock.range.charFrom,
				codeTo: parsedBlock.range.charTo,
				sectionStartLine: parsedBlock.openingFenceLine,
				sectionEndLine: parsedBlock.closingFenceLine,
				openingFence: parsedBlock.meta.openingFence,
				openingFenceLine: parsedBlock.openingFenceLine,
				closingFenceLine: parsedBlock.closingFenceLine,
			});
			plugin.codeBlockRegistry.upsert(block);

			if (block.fenceFrom === undefined || block.codeFrom === undefined || block.codeTo === undefined) {
				continue;
			}

			ranges.push(Decoration.widget({ widget: new ShikiLivePreviewHeaderWidget(block, plugin), block: true, side: -1 }).range(block.fenceFrom));

			for (let lineNumber = parsedBlock.openingFenceLine; lineNumber <= parsedBlock.closingFenceLine; lineNumber++) {
				const line = state.doc.line(lineNumber);
				const isOpeningFence = lineNumber === parsedBlock.openingFenceLine;
				const isClosingFence = lineNumber === parsedBlock.closingFenceLine;
				const className = isOpeningFence
					? 'shiki-live-preview-fence-line shiki-live-preview-opening-fence-line'
					: isClosingFence
						? 'shiki-live-preview-fence-line shiki-live-preview-closing-fence-line'
						: `shiki-live-preview-code-line ${SHIKI_BLOCK_SCROLL_ROW_CLASS}${plugin.loadedSettings.wrapLines ? ' shiki-live-preview-code-line-wrap' : ' shiki-live-preview-code-line-nowrap'}`;
				ranges.push(
					Decoration.line({
						attributes: {
							class: className,
							'data-shiki-block-id': block.id,
							'data-shiki-editing-block-id': block.id,
							'data-shiki-scroll-owner': 'false',
						},
					}).range(line.from),
				);

				if (isOpeningFence || isClosingFence) {
					ranges.push(
						Decoration.replace({
							widget: new ShikiLivePreviewFenceWidget(isOpeningFence ? openingFenceText(block) : (block.openingFence ?? '```')),
						}).range(line.from, line.to),
					);
				}

				if (!isOpeningFence && !isClosingFence && line.from < line.to) {
					ranges.push(
						Decoration.mark({
							attributes: {
								class: SHIKI_LIVE_PREVIEW_CODE_CONTENT_CLASS,
								'data-shiki-block-id': block.id,
							},
						}).range(line.from, line.to),
					);
				}

				if (!isOpeningFence && !isClosingFence && plugin.loadedSettings.showLineNumbers) {
					ranges.push(
						Decoration.widget({
							widget: new ShikiLivePreviewLineNumberWidget(block.id, lineNumber - parsedBlock.openingFenceLine),
							side: -1,
						}).range(line.from),
					);
				}
			}

			const closingFence = state.doc.line(parsedBlock.closingFenceLine);
			ranges.push(createBlockHorizontalScrollbarDecoration(block.id, plugin.loadedSettings.wrapLines).range(closingFence.to));
		}

		return { decorations: ranges.length ? Decoration.set(ranges, true) : Decoration.none, inputs };
	};

	const structureField = StateField.define<LivePreviewStructureState>({
		create: buildState,
		update(value, transaction) {
			const inputs = readInputs(plugin);
			if (!transaction.docChanged && sameInputs(value.inputs, inputs)) {
				return value;
			}
			return buildState(transaction.state);
		},
		provide: field => [EditorView.decorations.from(field, value => value.decorations)],
	});

	return [structureField];
}

function isLivePreviewActive(plugin: ShikiPlugin): boolean {
	const activeContainer = plugin.app.workspace.activeLeaf?.view?.containerEl;
	return !!activeContainer && activeContainer.querySelector('.markdown-source-view.mod-cm6.is-live-preview') !== null;
}

function readInputs(plugin: ShikiPlugin): LivePreviewStructureInputs {
	return {
		isLivePreview: isLivePreviewActive(plugin),
		showLineNumbers: plugin.loadedSettings.showLineNumbers,
		sourcePath: plugin.app.workspace.getActiveFile()?.path ?? '',
		wrapLines: plugin.loadedSettings.wrapLines,
	};
}

function sameInputs(first: LivePreviewStructureInputs, second: LivePreviewStructureInputs): boolean {
	return (
		first.isLivePreview === second.isLivePreview &&
		first.showLineNumbers === second.showLineNumbers &&
		first.sourcePath === second.sourcePath &&
		first.wrapLines === second.wrapLines
	);
}

function collectLines(state: EditorState): CodeBlockLineInfo[] {
	const lines: CodeBlockLineInfo[] = [];
	for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
		const line = state.doc.line(lineNumber);
		lines.push({ lineNumber, text: line.text, from: line.from, to: line.to });
	}
	return lines;
}
