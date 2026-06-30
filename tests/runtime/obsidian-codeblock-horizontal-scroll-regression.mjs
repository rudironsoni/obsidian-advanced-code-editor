#!/usr/bin/env node

const PORT = Number(process.env.OBSIDIAN_DEBUG_PORT ?? 9230);
const NOTE_PATH = 'narrow-scroll-regression.md';

function assert(condition, message, details = undefined) {
	if (!condition) {
		const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
		throw new Error(`${message}${suffix}`);
	}
}

async function delay(ms) {
	await new Promise(resolve => setTimeout(resolve, ms));
}

async function connectToExistingObsidian() {
	const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then(response => response.json());
	const page = targets.find(target => target.type === 'page' && /app:\/\/obsidian\.md\/index\.html/i.test(target.url ?? ''));
	assert(page?.webSocketDebuggerUrl, `No Obsidian page target is listening on CDP port ${PORT}`);

	const ws = new WebSocket(page.webSocketDebuggerUrl);
	let id = 0;
	const pending = new Map();
	ws.onmessage = event => {
		const message = JSON.parse(event.data);
		if (!message.id || !pending.has(message.id)) return;
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
	};
	await new Promise((resolve, reject) => {
		ws.onopen = resolve;
		ws.onerror = reject;
	});

	return {
		send(method, params = {}) {
			const messageId = ++id;
			ws.send(JSON.stringify({ id: messageId, method, params }));
			return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
		},
		close() {
			ws.close();
		},
	};
}

async function evaluate(client, expression) {
	const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails));
	}
	return result.result.value;
}

async function setupFixture(client) {
	const longA = `const insanelyLongValueName = "${'0123456789abcdefghijklmnopqrstuvwxyz'.repeat(10)}";`;
	const longB = `const secondLongValueName = "${'ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210'.repeat(8)}";`;
	const content = ['# Narrow scroll regression', '', '```ts', longA, longB, '```', '', 'after'].join('\n');
	await evaluate(
		client,
		`(async () => {
			let file = window.app.vault.getAbstractFileByPath(${JSON.stringify(NOTE_PATH)});
			if (!file) file = await window.app.vault.create(${JSON.stringify(NOTE_PATH)}, ${JSON.stringify(content)});
			else await window.app.vault.modify(file, ${JSON.stringify(content)});
			await window.app.workspace.getLeaf(false).openFile(file);
			window.app.workspace.leftSplit?.collapse?.();
			window.app.workspace.rightSplit?.collapse?.();
			let style = document.getElementById('shiki-narrow-scroll-regression-style');
			if (!style) {
				style = document.createElement('style');
				style.id = 'shiki-narrow-scroll-regression-style';
				document.head.appendChild(style);
			}
			style.textContent = '.workspace-leaf.mod-active .view-content { max-width: 390px !important; width: 390px !important; } .workspace-leaf.mod-active .markdown-source-view, .workspace-leaf.mod-active .markdown-reading-view { max-width: 390px !important; }';
			const plugin = window.app.plugins.plugins['advanced-code-block'];
			plugin?.registerInlineCodeProcessor?.();
			plugin?.registerCodeBlockProcessors?.();
			plugin?.registerCm6Plugin?.();
			return true;
		})()`,
	);
	await delay(1000);
}

async function verifyLivePreviewViewing(client) {
	const state = await evaluate(
		client,
		`(async () => {
			const leaf = window.app.workspace.activeLeaf;
			const file = window.app.workspace.getActiveFile();
			await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source: false }, active: true }, { history: false });
			await new Promise(resolve => setTimeout(resolve, 1000));
			const editor = leaf.view.editor;
			editor.setCursor({ line: 7, ch: 0 });
			await window.app.plugins.plugins['advanced-code-block']?.updateCm6Plugin?.();
			await new Promise(resolve => setTimeout(resolve, 1000));
			const root = leaf.view.containerEl;
			const scroller = root.querySelector('.cm-scroller');
			if (scroller) scroller.scrollLeft = 0;
			const block = root.querySelector('.shiki-live-preview-block');
			const body = block?.querySelector('.shiki-block-body');
			const codeScroll = block?.querySelector('.shiki-code-scroll');
			const lineNumbers = block?.querySelector('.shiki-line-numbers');
			const code = block?.querySelector('code');
			const beforeLineLeft = lineNumbers?.getBoundingClientRect().left ?? null;
			const beforeCodeLeft = code?.getBoundingClientRect().left ?? null;
			if (body) body.scrollLeft = 260;
			const afterLineLeft = lineNumbers?.getBoundingClientRect().left ?? null;
			const afterCodeLeft = code?.getBoundingClientRect().left ?? null;
			return {
				hasBlock: !!block,
				bodyClient: body?.clientWidth ?? 0,
				bodyScrollWidth: body?.scrollWidth ?? 0,
				bodyScrollLeft: body?.scrollLeft ?? 0,
				codeScrollLeft: codeScroll?.scrollLeft ?? 0,
				lineMoved: beforeLineLeft !== null && afterLineLeft !== null ? beforeLineLeft - afterLineLeft : 0,
				codeMoved: beforeCodeLeft !== null && afterCodeLeft !== null ? beforeCodeLeft - afterCodeLeft : 0,
				noteScrollLeft: scroller?.scrollLeft ?? 0,
			};
		})()`,
	);
	assert(state.hasBlock, 'Live Preview viewing did not render a Shiki block', state);
	assert(state.bodyScrollWidth > state.bodyClient, 'Live Preview viewing block body is not horizontally scrollable', state);
	assert(state.bodyScrollLeft > 0, 'Live Preview viewing block body did not scroll', state);
	assert(state.lineMoved > 0 && state.codeMoved > 0, 'Live Preview viewing did not scroll the whole block content together', state);
	assert(state.codeScrollLeft === 0, 'Live Preview viewing scrolled the inner code column instead of the block body', state);
	assert(state.noteScrollLeft === 0, 'Live Preview viewing moved the note horizontally', state);
	return state;
}

async function verifyLivePreviewEditing(client) {
	const state = await evaluate(client, blockScrollExpression('live-preview-editing', false));
	assertBlockScrollerState(state, 'Live Preview editing');
	return state;
}

async function verifySourceMode(client) {
	const state = await evaluate(client, blockScrollExpression('source', true));
	assertBlockScrollerState(state, 'Source mode');
	return state;
}

function blockScrollExpression(label, source) {
	return `(async () => {
		const leaf = window.app.workspace.activeLeaf;
		const file = window.app.workspace.getActiveFile();
		await leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: 'source', source: ${source} }, active: true }, { history: false });
		await new Promise(resolve => setTimeout(resolve, 1000));
		const editor = leaf.view.editor;
		const line = editor.getValue().split('\\n').findIndex(value => value.includes('insanelyLongValueName'));
		editor.setCursor({ line, ch: 20 });
		editor.focus();
		await window.app.plugins.plugins['advanced-code-block']?.updateCm6Plugin?.();
		await new Promise(resolve => setTimeout(resolve, 1000));
		const root = leaf.view.containerEl;
		const scroller = root.querySelector('.cm-scroller');
		if (scroller) scroller.scrollLeft = 0;
		const lines = [...root.querySelectorAll(${source ? "'.cm-content .cm-line'" : "'.shiki-editing-codeblock-active-line-nowrap'"})].filter(el => el.textContent?.includes('LongValueName'));
		const before = lines.map(el => el.getBoundingClientRect().left);
		if (scroller) scroller.scrollLeft = 300;
		const after = lines.map(el => el.getBoundingClientRect().left);
		return {
			label: ${JSON.stringify(label)},
			lineCount: lines.length,
			scrollerClient: scroller?.clientWidth ?? 0,
			scrollerScrollWidth: scroller?.scrollWidth ?? 0,
			scrollerScrollLeft: scroller?.scrollLeft ?? 0,
			lineMoved: before.map((left, index) => left - after[index]),
			anyLineOwnScroll: lines.some(el => el.scrollLeft > 0),
			bodyScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
		};
	})()`;
}

function assertBlockScrollerState(state, label) {
	assert(state.lineCount >= 2, `${label} did not find both long code lines`, state);
	assert(state.scrollerScrollWidth > state.scrollerClient, `${label} editor scroller is not horizontally scrollable`, state);
	assert(state.scrollerScrollLeft > 0, `${label} editor scroller did not scroll`, state);
	assert(
		state.lineMoved.every(value => Math.abs(value - 300) < 2),
		`${label} did not move every code line with the editor scroller`,
		state,
	);
	assert(!state.anyLineOwnScroll, `${label} left horizontal scroll on individual lines`, state);
	assert(state.bodyScrollLeft === 0, `${label} moved the document horizontally`, state);
}

async function main() {
	const client = await connectToExistingObsidian();
	try {
		await client.send('Runtime.enable');
		await setupFixture(client);
		const livePreviewViewing = await verifyLivePreviewViewing(client);
		const livePreviewEditing = await verifyLivePreviewEditing(client);
		const sourceMode = await verifySourceMode(client);
		console.log(JSON.stringify({ ok: true, livePreviewViewing, livePreviewEditing, sourceMode }, null, 2));
	} finally {
		client.close();
	}
}

main().catch(error => {
	console.error(`verify:obsidian-codeblock-horizontal-scroll-regression failed: ${error.stack ?? error.message}`);
	process.exit(1);
});
