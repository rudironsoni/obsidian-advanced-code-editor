import { describe, expect, test } from 'bun:test';
import { buildShikiTokenSegments, ShikiHighlighter } from 'packages/obsidian/src/ShikiHighlighter';

const matrix = [
	{ language: 'cs', lineText: 'List<int[]> mergedIntervals = new();', needles: ['List', 'int', 'mergedIntervals', 'new'] },
	{ language: 'ts', lineText: 'type User = { id: number; name: string };', needles: ['type', 'User', 'number', 'string'] },
	{ language: 'js', lineText: 'const result = items.map(item => item.id);', needles: ['const', 'result', 'map', 'item', 'id'] },
	{ language: 'py', lineText: 'def merge(values: list[int]) -> list[int]:', needles: ['def', 'merge', 'list', 'int'] },
	{ language: 'rs', lineText: 'fn merge(values: Vec<i32>) -> Vec<i32> {', needles: ['fn', 'merge', 'Vec', 'i32'] },
	{ language: 'go', lineText: 'func Merge(values []int) []int {', needles: ['func', 'Merge', 'int'] },
	{ language: 'json', lineText: '"enabled": true,', needles: ['enabled', 'true'] },
	{ language: 'yml', lineText: 'enabled: true', needles: ['enabled', 'true'] },
	{ language: 'bash', lineText: 'for file in *.md; do echo "$file"; done', needles: ['for', 'file', 'in', 'echo'] },
	{ language: 'html', lineText: '<section class="note"><h1>Title</h1></section>', needles: ['section', 'class', 'note', 'h1'] },
	{ language: 'css', lineText: '.note { color: rebeccapurple; display: grid; }', needles: ['note', 'color', 'rebeccapurple', 'display', 'grid'] },
] as const;

function createHighlighter(disabledLanguages: string[] = []): ShikiHighlighter {
	const plugin = {
		loadedSettings: {
			disabledLanguages,
			darkTheme: 'github-dark',
			lightTheme: 'github-light',
			preferThemeColors: true,
		},
		ensureSettingsLoaded: async (): Promise<void> => {},
		getActiveTheme: (): string => 'github-light',
	};
	return new ShikiHighlighter(plugin as never);
}

describe('Shiki language matrix', () => {
	test('tokenizes representative language aliases through the plugin highlighter', async () => {
		const highlighter = createHighlighter();

		for (const probe of matrix) {
			const highlight = await highlighter.getHighlightTokens(probe.lineText, probe.language);
			expect(highlight, probe.language).toBeDefined();
			const tokens = highlight?.tokens.flat() ?? [];
			const coloredTokens = tokens.filter(token => token.color);
			const colors = new Set(coloredTokens.map(token => token.color));

			expect(coloredTokens.length, probe.language).toBeGreaterThanOrEqual(probe.needles.length);
			expect(colors.size, probe.language).toBeGreaterThanOrEqual(2);
			for (const needle of probe.needles) {
				expect(
					coloredTokens.some(token => token.content.includes(needle)),
					`${probe.language} should color ${needle}`,
				).toBe(true);
			}
		}
	});

	test('builds token segments from source slices for every matrix language', async () => {
		const highlighter = createHighlighter();

		for (const probe of matrix) {
			const highlight = await highlighter.getHighlightTokens(probe.lineText, probe.language);
			expect(highlight, probe.language).toBeDefined();
			const segments = highlighter.getTokenSegments(probe.lineText, highlight?.tokens ?? []);
			const text = segments[0]?.map(segment => segment.text).join('') ?? '';

			expect(text, probe.language).toBe(probe.lineText);
			for (const needle of probe.needles) {
				expect(
					segments[0]?.some(segment => segment.text.includes(needle) && segment.token?.color),
					`${probe.language} should keep colored segment for ${needle}`,
				).toBe(true);
			}
		}
	});

	test('builds token segments when runtime tokens omit offsets', () => {
		const code = 'const result = items.map(item => item.id);';
		const segments = buildShikiTokenSegments(code, [
			[
				{ content: 'const', color: '#cf222e' },
				{ content: 'result', color: '#24292f' },
				{ content: '=', color: '#0550ae' },
				{ content: 'items', color: '#24292f' },
				{ content: '.', color: '#24292f' },
				{ content: 'map', color: '#8250df' },
				{ content: 'item', color: '#953800' },
				{ content: '=>', color: '#cf222e' },
				{ content: 'item', color: '#953800' },
				{ content: '.', color: '#24292f' },
				{ content: 'id', color: '#24292f' },
			],
		] as never);

		expect(segments[0]?.map(segment => segment.text).join('')).toBe(code);
		expect(segments[0]?.filter(segment => segment.token?.color).map(segment => segment.text)).toEqual([
			'const',
			'result',
			'=',
			'items',
			'.',
			'map',
			'item',
			'=>',
			'item',
			'.',
			'id',
		]);
	});

	test('does not emit tokens for disabled languages', async () => {
		const highlighter = createHighlighter(['cs']);

		const highlight = await highlighter.getHighlightTokens('List<int[]> mergedIntervals = new();', 'cs');

		expect(highlight).toBeUndefined();
	});
});
