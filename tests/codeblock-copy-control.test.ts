import { describe, expect, test } from 'bun:test';
import { createCodeBlockCopyButton } from 'packages/obsidian/src/codeblocks/CodeBlockCopyControl';
import './happydom';

describe('CodeBlockCopyControl', () => {
	test('shows copied and error states while preserving the current code provider', async () => {
		const writes: string[] = [];
		const originalClipboard = navigator.clipboard;
		let rejectNextWrite = false;
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: (text: string): Promise<void> => {
					writes.push(text);
					if (rejectNextWrite) {
						rejectNextWrite = false;
						return Promise.reject(new Error('clipboard unavailable'));
					}
					return Promise.resolve();
				},
			},
		});
		let code = 'const first = 1;';
		const button = createCodeBlockCopyButton(document, () => code);

		try {
			expect(button.type).toBe('button');
			expect(button.textContent).toBe('Copy');
			expect(button.dataset.shikiCopyState).toBe('idle');
			expect(button.getAttribute('aria-label')).toBe('Copy code block');

			button.click();
			await Promise.resolve();

			expect(writes).toEqual(['const first = 1;']);
			expect(button.textContent).toBe('Copied');
			expect(button.dataset.shikiCopyState).toBe('copied');
			expect(button.getAttribute('aria-label')).toBe('Code copied');

			code = 'const second = 2;';
			rejectNextWrite = true;
			button.click();
			await Promise.resolve();

			expect(writes).toEqual(['const first = 1;', 'const second = 2;']);
			expect(button.textContent).toBe('Error');
			expect(button.dataset.shikiCopyState).toBe('error');
			expect(button.getAttribute('aria-label')).toBe('Copy failed');
		} finally {
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: originalClipboard,
			});
		}
	});
});
