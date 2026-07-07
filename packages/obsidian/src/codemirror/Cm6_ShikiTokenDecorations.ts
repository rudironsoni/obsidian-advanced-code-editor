import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet } from '@codemirror/view';
import type { CodeBlockModel } from 'packages/obsidian/src/codeblocks/CodeBlockModel';
import type ShikiPlugin from 'packages/obsidian/src/main';
import { getActiveTheme } from 'packages/obsidian/src/runtime/ThemeBridge';
import { SHIKI_TOKEN_CLASS } from 'packages/obsidian/src/ShikiHighlighter';

export type Cm6ShikiTokenBlock = CodeBlockModel & { codeFrom: number; codeTo: number };

export interface Cm6ShikiTokenDecorationResult {
	decorations: DecorationSet;
	themeBackground: string | undefined;
}

interface BuildCm6ShikiTokenDecorationsOptions {
	plugin: ShikiPlugin;
	blocks: readonly Cm6ShikiTokenBlock[];
	tokenClassName: string;
	shouldContinue: () => boolean;
}

export async function buildCm6ShikiTokenDecorations({
	plugin,
	blocks,
	tokenClassName,
	shouldContinue,
}: BuildCm6ShikiTokenDecorationsOptions): Promise<Cm6ShikiTokenDecorationResult | undefined> {
	const theme = getActiveTheme(plugin);
	const settingsSignature = JSON.stringify({ disabledLanguages: plugin.loadedSettings.disabledLanguages, theme });
	const builder = new RangeSetBuilder<Decoration>();
	let themeBackground: string | undefined;

	for (const block of blocks) {
		const cached = plugin.sourceModeTokenizationCache.get({
			sourcePath: block.sourcePath,
			language: block.language,
			theme,
			contentHash: block.contentHash,
			settingsSignature,
		});
		const highlight = cached ?? (await plugin.highlighter.getHighlightTokens(block.code, block.language));
		if (!shouldContinue()) {
			return undefined;
		}
		if (!cached) {
			plugin.sourceModeTokenizationCache.set(
				{
					sourcePath: block.sourcePath,
					language: block.language,
					theme,
					contentHash: block.contentHash,
					settingsSignature,
				},
				highlight,
			);
		}
		if (!highlight) {
			continue;
		}

		themeBackground ??= plugin.highlighter.getThemeBackground(highlight);
		for (const lineSegments of plugin.highlighter.getTokenSegments(block.code, highlight.tokens)) {
			for (const segment of lineSegments) {
				if (!segment.token) {
					continue;
				}
				const from = block.codeFrom + segment.from;
				const to = Math.min(block.codeFrom + segment.to, block.codeTo);
				if (to <= from) {
					continue;
				}
				const tokenStyle = plugin.highlighter.getTokenStyle(segment.token);
				builder.add(
					from,
					to,
					Decoration.mark({
						attributes: {
							style: tokenStyle.style,
							class: [SHIKI_TOKEN_CLASS, tokenClassName, ...tokenStyle.classes].filter(Boolean).join(' '),
						},
					}),
				);
			}
		}
	}

	return { decorations: builder.finish(), themeBackground };
}
