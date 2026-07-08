import { describe, expect, test } from 'bun:test';
import type { ThemedToken } from 'shiki';

import { buildShikiTokenSegments } from 'packages/obsidian/src/ShikiHighlighter';

describe('Shiki token segments', () => {
	test('uses source slices instead of token content when C# tokens skip words inside comments', () => {
		const code = 'var startIndex = 0;\n// Define constants for start and end indices\nvar endIndex = 1;';
		const commentOffset = code.indexOf('//');
		const nextLineOffset = code.indexOf('var endIndex');
		const tokenLines = [
			[{ content: 'var', offset: 0, color: '#d73a49' }],
			[{ content: '// Define constants start end indices', offset: commentOffset, color: '#6a737d' }],
			[{ content: 'var', offset: nextLineOffset, color: '#d73a49' }],
		] satisfies ThemedToken[][];

		const segments = buildShikiTokenSegments(code, tokenLines);

		expect(segments[1]).toEqual([
			{
				from: commentOffset,
				to: nextLineOffset - 1,
				text: '// Define constants for start and end indices',
				token: tokenLines[1][0],
			},
		]);
	});

	test('preserves plain source gaps before and after styled tokens', () => {
		const code = '  Sort(value);';
		const tokenLines = [
			[
				{ content: 'Sort', offset: 2, color: '#6f42c1' },
				{ content: 'value', offset: 7, color: '#005cc5' },
			],
		] satisfies ThemedToken[][];

		const segments = buildShikiTokenSegments(code, tokenLines);

		expect(segments[0].map(segment => ({ text: segment.text, color: segment.token?.color }))).toEqual([
			{ text: '  ', color: undefined },
			{ text: 'Sort(', color: '#6f42c1' },
			{ text: 'value);', color: '#005cc5' },
		]);
	});
});
