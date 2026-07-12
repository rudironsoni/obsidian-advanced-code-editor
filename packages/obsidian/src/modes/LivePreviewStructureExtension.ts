import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { getLineMetadataClasses, parseCodeBlockDisplayMetadata, shouldShowLineNumbers } from 'packages/obsidian/src/codeblocks/CodeBlockDisplayMetadata';
import { isActiveLeafLivePreview, isLivePreviewState } from 'packages/obsidian/src/codemirror/Cm6_ViewContext';
import { CodeBlockParser } from 'packages/obsidian/src/codeblocks/CodeBlockParser';
import { createCodeBlockCopyButton } from 'packages/obsidian/src/codeblocks/CodeBlockCopyControl';
import type { CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type { CodeBlockLineInfo } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';

const SHIKI_LIVE_PREVIEW_CODE_CONTENT_CLASS = 'shiki-live-preview-code-content';
const SHIKI_LIVE_PREVIEW_FENCE_TEXT_CLASS = 'shiki-live-preview-fence-text';
const SHIKI_BLOCK_SCROLL_ROW_CLASS = 'shiki-block-scroll-row';

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
	constructor(private readonly block: CodeBlockModel) {
		super();
	}

	eq(other: ShikiLivePreviewHeaderWidget): boolean {
		return other.block.id === this.block.id && other.block.language === this.block.language && other.block.code === this.block.code;
	}

	toDOM(): HTMLElement {
		const metadata = parseCodeBlockDisplayMetadata(this.block.meta, this.block.code, this.block.language);
		const header = document.createElement('div');
		header.className = 'shiki-live-preview-header shiki-block-header';
		header.dataset.shikiBlockId = this.block.id;
		header.dataset.lang = this.block.language;
		const left = header.createDiv({ cls: 'shiki-header-left' });
		if (metadata.title) left.createSpan({ cls: 'shiki-block-title', text: metadata.title });
		left.createSpan({ cls: 'shiki-lang-name', text: this.block.language });
		const right = header.createDiv({ cls: 'shiki-header-right' });
		right.appendChild(createCodeBlockCopyButton(document, () => this.block.code));
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

export function createLivePreviewStructureExtension(plugin: ShikiPlugin): Extension {
	const parser = new CodeBlockParser();

	const buildState = (state: EditorState): LivePreviewStructureState => {
		const inputs = readInputs(plugin, state);
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
			const metadata = parseCodeBlockDisplayMetadata(block.meta, block.code, block.language);

			if (block.fenceFrom === undefined || block.codeFrom === undefined || block.codeTo === undefined) {
				continue;
			}
			const selectionHead = state.selection.main.head;
			if (selectionHead >= block.fenceFrom && selectionHead <= (block.fenceTo ?? block.codeTo)) {
				ranges.push(Decoration.widget({ widget: new ShikiLivePreviewHeaderWidget(block), block: true, side: -1 }).range(block.fenceFrom));
			}
			for (let lineNumber = parsedBlock.openingFenceLine; lineNumber <= parsedBlock.closingFenceLine; lineNumber++) {
				const line = state.doc.line(lineNumber);
				const isOpeningFence = lineNumber === parsedBlock.openingFenceLine;
				const isClosingFence = lineNumber === parsedBlock.closingFenceLine;
				const className = isOpeningFence
					? 'shiki-live-preview-fence-line shiki-live-preview-opening-fence-line'
					: isClosingFence
						? 'shiki-live-preview-fence-line shiki-live-preview-closing-fence-line'
						: [
								'shiki-live-preview-code-line',
								SHIKI_BLOCK_SCROLL_ROW_CLASS,
								plugin.loadedSettings.wrapLines ? 'shiki-live-preview-code-line-wrap' : 'shiki-live-preview-code-line-nowrap',
								...getLineMetadataClasses(metadata, lineNumber - parsedBlock.openingFenceLine),
							].join(' ');
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
						Decoration.mark({
							attributes: {
								class: SHIKI_LIVE_PREVIEW_FENCE_TEXT_CLASS,
								'data-shiki-block-id': block.id,
							},
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

				if (!isOpeningFence && !isClosingFence && shouldShowLineNumbers(metadata, plugin.loadedSettings.showLineNumbers)) {
					ranges.push(
						Decoration.widget({
							widget: new ShikiLivePreviewLineNumberWidget(block.id, lineNumber - parsedBlock.openingFenceLine),
							side: -1,
						}).range(line.from),
					);
				}
			}
		}

		return { decorations: ranges.length ? Decoration.set(ranges, true) : Decoration.none, inputs };
	};

	const structureField = StateField.define<LivePreviewStructureState>({
		create: buildState,
		update(value, transaction) {
			const inputs = readInputs(plugin, transaction.state);
			const selectionChanged = !transaction.startState.selection.eq(transaction.state.selection);
			if (!transaction.docChanged && !selectionChanged && sameInputs(value.inputs, inputs)) {
				return value;
			}
			return buildState(transaction.state);
		},
		provide: field => [EditorView.decorations.from(field, value => value.decorations)],
	});

	return [structureField];
}

function readInputs(plugin: ShikiPlugin, state: EditorState): LivePreviewStructureInputs {
	return {
		isLivePreview: isLivePreviewState(state) ?? isActiveLeafLivePreview(plugin),
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
