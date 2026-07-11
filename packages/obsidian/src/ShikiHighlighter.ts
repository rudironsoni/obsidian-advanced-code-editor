import type { HighlighterCore, TokensResult, ThemedToken } from 'shiki';
import { getConfiguredThemes } from 'packages/obsidian/src/runtime/ThemeBridge';
import { compressedShikiRegistry } from 'packages/obsidian/src/runtime/CompressedShikiRegistry';
import type ShikiPlugin from 'packages/obsidian/src/main';
import { getObsidianSafeLanguageNames, resolveLanguageAliasFromMetadata } from 'packages/obsidian/src/runtime/LanguageMetadata';

export interface ShikiTokenSegment {
	from: number;
	to: number;
	text: string;
	token: ThemedToken | undefined;
}

export const SHIKI_TOKEN_CLASS = 'shiki-token';
export const SHIKI_INLINE_TOKEN_CLASS = 'shiki-inline-token';
export const SHIKI_READING_TOKEN_CLASS = 'shiki-reading-token';
export const SHIKI_LIVE_PREVIEW_TOKEN_CLASS = 'shiki-live-preview-token';
export const SHIKI_SOURCE_TOKEN_CLASS = 'shiki-source-token';

function clampOffset(offset: number, min: number, max: number): number {
	return Math.max(min, Math.min(offset, max));
}

export function buildShikiTokenSegments(code: string, tokenLines: readonly (readonly ThemedToken[])[]): ShikiTokenSegment[][] {
	const lines = code.split('\n');
	const segments: ShikiTokenSegment[][] = [];
	let lineStart = 0;

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex] ?? '';
		const lineEnd = lineStart + line.length;
		const lineTokens = tokenLines[lineIndex] ?? [];
		const lineSegments: ShikiTokenSegment[] = [];
		let cursor = lineStart;

		for (let tokenIndex = 0; tokenIndex < lineTokens.length; tokenIndex++) {
			const token = lineTokens[tokenIndex];
			const next = lineTokens[tokenIndex + 1];
			const tokenOffset = Number.isFinite(token.offset) ? token.offset : undefined;
			const nextOffset = Number.isFinite(next?.offset) ? next?.offset : undefined;
			const tokenContent = token.content ?? '';
			const from =
				tokenOffset !== undefined
					? clampOffset(tokenOffset, lineStart, lineEnd)
					: lineStart + fallbackTokenColumn(line, tokenContent, Math.max(0, cursor - lineStart));
			const to = tokenOffset !== undefined ? clampOffset(nextOffset ?? lineEnd, from, lineEnd) : clampOffset(from + tokenContent.length, from, lineEnd);

			if (from > cursor) {
				lineSegments.push({ from: cursor, to: from, text: code.slice(cursor, from), token: undefined });
			}
			if (to > from) {
				lineSegments.push({ from, to, text: code.slice(from, to), token });
			}
			cursor = Math.max(cursor, to);
		}

		if (cursor < lineEnd) {
			lineSegments.push({ from: cursor, to: lineEnd, text: code.slice(cursor, lineEnd), token: undefined });
		}

		segments.push(lineSegments);
		lineStart = lineEnd + 1;
	}

	return segments;
}

function fallbackTokenColumn(line: string, tokenContent: string, cursorColumn: number): number {
	if (!tokenContent) {
		return cursorColumn;
	}
	const index = line.indexOf(tokenContent, cursorColumn);
	return index >= 0 ? index : cursorColumn;
}

export class ShikiHighlighter {
	private highlighter: HighlighterCore | undefined;
	private readonly plugin: ShikiPlugin;
	private loadedLanguages = new Set<string>();
	private initPromise: Promise<void> | undefined;

	constructor(plugin: ShikiPlugin) {
		this.plugin = plugin;
	}

	async init(): Promise<void> {
		if (this.highlighter) {
			return;
		}
		if (this.initPromise) {
			await this.initPromise;
			return;
		}
		this.initPromise = this.createHighlighter();
		try {
			await this.initPromise;
		} finally {
			this.initPromise = undefined;
		}
	}

	private async createHighlighter(): Promise<void> {
		const [{ createHighlighterCore }, { createOnigurumaEngine }, { default: loadWasm }] = await Promise.all([
			import('shiki/core'),
			import('shiki/engine/oniguruma'),
			import('shiki/wasm'),
		]);
		const themes = getConfiguredThemes(this.plugin);
		const configuredThemes = themes.length > 0 ? themes : ['github-dark', 'github-light'];
		const registrations = await Promise.all(configuredThemes.map(theme => compressedShikiRegistry.loadTheme(theme)));
		this.highlighter = await createHighlighterCore({
			themes: registrations,
			langs: [],
			engine: createOnigurumaEngine(loadWasm),
		});
	}

	async reload(): Promise<void> {
		await this.unload();
		await this.init();
	}

	async unload(): Promise<void> {
		this.initPromise = undefined;
		this.highlighter = undefined;
		this.loadedLanguages.clear();
	}

	obsidianSafeLanguageNames(): string[] {
		return getObsidianSafeLanguageNames();
	}

	resolveLanguageAlias(lang: string): string | undefined {
		return resolveLanguageAliasFromMetadata(lang);
	}

	supportedLanguages(): string[] {
		return this.obsidianSafeLanguageNames();
	}

	async ensureLanguage(lang: string): Promise<void> {
		if (!this.highlighter || this.loadedLanguages.has(lang)) {
			return;
		}
		const canonical = this.resolveLanguageAlias(lang) ?? lang;
		try {
			await this.highlighter.loadLanguage(...(await compressedShikiRegistry.loadLanguage(canonical)));
			this.loadedLanguages.add(lang);
			this.loadedLanguages.add(canonical);
		} catch {
			// Language not available in Shiki
		}
	}

	async getHighlightTokens(code: string, lang: string): Promise<TokensResult | undefined> {
		await this.plugin.ensureSettingsLoaded();
		const normalized = lang.trim().toLowerCase().split(/\s+/)[0] ?? '';
		if (this.plugin.loadedSettings.disabledLanguages.includes(normalized)) {
			return undefined;
		}
		try {
			if (!this.highlighter) await this.init();
			const highlighter = this.highlighter;
			if (!highlighter) return undefined;
			const theme = this.plugin.getActiveTheme();
			const canonical = this.resolveLanguageAlias(normalized) ?? normalized;
			await this.ensureLanguage(canonical);
			return highlighter.codeToTokens(code, { lang: canonical, theme });
		} catch {
			return undefined;
		}
	}

	async render(code: string, lang: string, container: HTMLElement, meta = ''): Promise<void> {
		return this.renderWithShiki(code, lang, meta, container);
	}

	async renderWithShiki(code: string, lang: string, meta: string, container: HTMLElement): Promise<void> {
		container.empty();
		container.classList.add('shiki-rendered-block');
		if (meta) {
			container.createDiv({ text: meta, cls: 'shiki-ec-meta' });
		}
		const pre = container.createEl('pre');
		const codeEl = pre.createEl('code');
		const highlight = await this.getHighlightTokens(code, lang);
		const tokens = highlight?.tokens.flat(1);
		if (!tokens?.length) {
			codeEl.textContent = code;
			return;
		}
		this.renderTokens(tokens, codeEl, [SHIKI_TOKEN_CLASS]);
	}

	renderTokens(tokens: ThemedToken[], parent: HTMLElement, classes: string[] = [SHIKI_TOKEN_CLASS, SHIKI_INLINE_TOKEN_CLASS]): void {
		parent.empty();
		for (const token of tokens) {
			const span = parent.createSpan({
				text: token.content,
				cls: classes.join(' '),
				attr: { style: `color: ${token.color ?? 'inherit'}` },
			});
			if (token.fontStyle) {
				if (token.fontStyle & 1) span.style.fontStyle = 'italic';
				if (token.fontStyle & 2) span.style.fontWeight = 'bold';
				if (token.fontStyle & 4) span.style.textDecoration = 'underline';
			}
		}
	}

	getTokenSegments(code: string, tokenLines: readonly (readonly ThemedToken[])[]): ShikiTokenSegment[][] {
		return buildShikiTokenSegments(code, tokenLines);
	}

	getTokenStyle(token: ThemedToken): { style: string; classes: string[] } {
		const styles: string[] = [];
		if (token.color) styles.push(`color: ${token.color}`);
		if (token.fontStyle) {
			if (token.fontStyle & 1) styles.push('font-style: italic');
			if (token.fontStyle & 2) styles.push('font-weight: bold');
			if (token.fontStyle & 4) styles.push('text-decoration: underline');
		}
		return { style: styles.join('; '), classes: [] };
	}

	getThemeBackground(highlight: TokensResult | undefined): string | undefined {
		if (!this.plugin.loadedSettings.preferThemeColors) {
			return undefined;
		}
		return highlight?.bg;
	}
}
