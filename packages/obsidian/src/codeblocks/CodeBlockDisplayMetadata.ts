export interface CodeBlockDisplayMetadata {
	title: string | undefined;
	showLineNumbers: boolean | undefined;
	highlightedLines: ReadonlySet<number>;
	insertedLines: ReadonlySet<number>;
	deletedLines: ReadonlySet<number>;
}

export const SHIKI_LINE_HIGHLIGHT_CLASS = 'shiki-line-highlight';
export const SHIKI_LINE_INSERTED_CLASS = 'shiki-line-inserted';
export const SHIKI_LINE_DELETED_CLASS = 'shiki-line-deleted';

export function parseCodeBlockDisplayMetadata(meta: string, code: string, language: string): CodeBlockDisplayMetadata {
	const title = parseTitle(meta);
	const showLineNumbers = parseLineNumberSetting(meta);
	const highlightedLines = parseBareLineRanges(meta);
	const insertedLines = parseNamedLineRanges(meta, 'ins');
	const deletedLines = parseNamedLineRanges(meta, 'del');

	if (language.trim().toLowerCase() === 'diff') {
		for (const [index, line] of code.split('\n').entries()) {
			if (line.startsWith('+') && !line.startsWith('+++')) {
				insertedLines.add(index + 1);
			} else if (line.startsWith('-') && !line.startsWith('---')) {
				deletedLines.add(index + 1);
			}
		}
	}

	return {
		title,
		showLineNumbers,
		highlightedLines,
		insertedLines,
		deletedLines,
	};
}

export function shouldShowLineNumbers(metadata: CodeBlockDisplayMetadata, defaultValue: boolean): boolean {
	return metadata.showLineNumbers ?? defaultValue;
}

export function getLineMetadataClasses(metadata: CodeBlockDisplayMetadata, lineNumber: number): string[] {
	const classes: string[] = [];
	if (metadata.highlightedLines.has(lineNumber)) {
		classes.push(SHIKI_LINE_HIGHLIGHT_CLASS);
	}
	if (metadata.insertedLines.has(lineNumber)) {
		classes.push(SHIKI_LINE_INSERTED_CLASS);
	}
	if (metadata.deletedLines.has(lineNumber)) {
		classes.push(SHIKI_LINE_DELETED_CLASS);
	}
	return classes;
}

function parseTitle(meta: string): string | undefined {
	const quoted = /(?:^|\s)title=(["'])(.*?)\1/.exec(meta);
	if (quoted?.[2]?.trim()) {
		return quoted[2].trim();
	}
	const bare = /(?:^|\s)title=([^\s]+)/.exec(meta);
	const title = bare?.[1]?.trim();
	return title === '' ? undefined : title;
}

function parseLineNumberSetting(meta: string): boolean | undefined {
	if (/(?:^|\s)(?:noLineNumbers|hideLineNumbers)(?:\s|$)/.test(meta)) {
		return false;
	}
	if (/(?:^|\s)showLineNumbers(?:\s|$)/.test(meta)) {
		return true;
	}
	return undefined;
}

function parseNamedLineRanges(meta: string, name: 'ins' | 'del'): Set<number> {
	const result = new Set<number>();
	const pattern = new RegExp(`(?:^|\\s)${name}=\\{([^}]+)\\}`, 'g');
	for (const match of meta.matchAll(pattern)) {
		addRanges(result, match[1] ?? '');
	}
	return result;
}

function parseBareLineRanges(meta: string): Set<number> {
	const result = new Set<number>();
	const stripped = stripQuotedStrings(meta);
	for (const match of stripped.matchAll(/(?:^|\s)\{([^}]+)\}/g)) {
		addRanges(result, match[1] ?? '');
	}
	return result;
}

function stripQuotedStrings(value: string): string {
	return value.replace(/(["']).*?\1/g, '');
}

function addRanges(target: Set<number>, value: string): void {
	for (const part of value.split(',')) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}
		const range = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
		if (range) {
			const from = Number(range[1]);
			const to = Number(range[2]);
			if (!Number.isInteger(from) || !Number.isInteger(to)) {
				continue;
			}
			for (let line = Math.min(from, to); line <= Math.max(from, to); line++) {
				target.add(line);
			}
			continue;
		}
		const line = Number(trimmed);
		if (Number.isInteger(line) && line > 0) {
			target.add(line);
		}
	}
}
