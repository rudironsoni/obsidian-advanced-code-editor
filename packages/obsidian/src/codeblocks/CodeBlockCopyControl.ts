export type CodeBlockCopyState = 'idle' | 'copied' | 'error';

export const SHIKI_COPY_BUTTON_CLASS = 'shiki-copy-button';

const COPY_STATE_LABELS: Record<CodeBlockCopyState, string> = {
	idle: 'Copy',
	copied: 'Copied',
	error: 'Error',
};

const COPY_STATE_ARIA_LABELS: Record<CodeBlockCopyState, string> = {
	idle: 'Copy code block',
	copied: 'Code copied',
	error: 'Copy failed',
};

export function createCodeBlockCopyButton(doc: Document, getCode: () => string): HTMLButtonElement {
	const button = doc.createElement('button');
	button.type = 'button';
	button.className = SHIKI_COPY_BUTTON_CLASS;
	button.setAttribute('aria-live', 'polite');
	applyCopyState(button, 'idle');

	button.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		void copyCodeBlock(button, getCode);
	});

	return button;
}

async function copyCodeBlock(button: HTMLButtonElement, getCode: () => string): Promise<void> {
	try {
		await navigator.clipboard.writeText(getCode());
		applyCopyState(button, 'copied');
	} catch {
		applyCopyState(button, 'error');
	}
}

function applyCopyState(button: HTMLButtonElement, state: CodeBlockCopyState): void {
	button.dataset.shikiCopyState = state;
	button.textContent = COPY_STATE_LABELS[state];
	button.setAttribute('aria-label', COPY_STATE_ARIA_LABELS[state]);
}
