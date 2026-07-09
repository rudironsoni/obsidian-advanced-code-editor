import { describe, expect, test } from 'bun:test';
import {
	getLineMetadataClasses,
	parseCodeBlockDisplayMetadata,
	SHIKI_LINE_DELETED_CLASS,
	SHIKI_LINE_HIGHLIGHT_CLASS,
	SHIKI_LINE_INSERTED_CLASS,
	shouldShowLineNumbers,
} from 'packages/obsidian/src/codeblocks/CodeBlockDisplayMetadata';

describe('CodeBlockDisplayMetadata', () => {
	test('parses title, line numbers, highlights, and diff ranges', () => {
		const metadata = parseCodeBlockDisplayMetadata('title="Example Block" showLineNumbers {2, 4-5} ins={3} del={6-7}', '', 'ts');

		expect(metadata.title).toBe('Example Block');
		expect(metadata.showLineNumbers).toBe(true);
		expect([...metadata.highlightedLines]).toEqual([2, 4, 5]);
		expect([...metadata.insertedLines]).toEqual([3]);
		expect([...metadata.deletedLines]).toEqual([6, 7]);
		expect(shouldShowLineNumbers(metadata, false)).toBe(true);
	});

	test('supports disabling line numbers per block', () => {
		const metadata = parseCodeBlockDisplayMetadata('noLineNumbers', '', 'ts');

		expect(metadata.showLineNumbers).toBe(false);
		expect(shouldShowLineNumbers(metadata, true)).toBe(false);
	});

	test('does not treat title braces as line highlights', () => {
		const metadata = parseCodeBlockDisplayMetadata('title="Map<string, {value}>" {1}', '', 'ts');

		expect(metadata.title).toBe('Map<string, {value}>');
		expect([...metadata.highlightedLines]).toEqual([1]);
	});

	test('adds inserted and deleted classes for diff language prefixes', () => {
		const metadata = parseCodeBlockDisplayMetadata('', ' unchanged\n+added\n-removed\n+++ header\n--- header', 'diff');

		expect([...metadata.insertedLines]).toEqual([2]);
		expect([...metadata.deletedLines]).toEqual([3]);
		expect(getLineMetadataClasses(metadata, 2)).toEqual([SHIKI_LINE_INSERTED_CLASS]);
		expect(getLineMetadataClasses(metadata, 3)).toEqual([SHIKI_LINE_DELETED_CLASS]);
	});

	test('returns all classes for overlapping metadata', () => {
		const metadata = parseCodeBlockDisplayMetadata('{2} ins={2} del={3}', '', 'ts');

		expect(getLineMetadataClasses(metadata, 2)).toEqual([SHIKI_LINE_HIGHLIGHT_CLASS, SHIKI_LINE_INSERTED_CLASS]);
		expect(getLineMetadataClasses(metadata, 3)).toEqual([SHIKI_LINE_DELETED_CLASS]);
	});
});
