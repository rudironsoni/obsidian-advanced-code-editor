#!/usr/bin/env node

const PORT = Number(process.env.OBSIDIAN_DEBUG_PORT ?? 9230);
const NOTE_PATH = 'narrow-scroll-regression.md';

function assert(condition, message, details = undefined) {
	if (!condition) {
		const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
		throw new Error(`${message}${suffix}`);
	}
}

function isOpaqueColor(value) {
	return typeof value === 'string' && !/^rgba\([^)]*,\s*(?:0|0?\.\d+)\s*\)$/i.test(value);
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

async function evaluate(client, expression, label = 'evaluation') {
	const result = await Promise.race([
		client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
		new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 20000)),
	]);
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails));
	}
	return result.result.value;
}

async function waitFor(client, expression, label, timeoutMs = 10000) {
	const deadline = Date.now() + timeoutMs;
	let lastValue;
	while (Date.now() < deadline) {
		lastValue = await evaluate(client, expression, label);
		if (lastValue) return lastValue;
		await delay(150);
	}
	throw new Error(`${label} timed out\nLast value:\n${JSON.stringify(lastValue, null, 2)}`);
}

async function requestMode(client, mode, source = false) {
	await evaluate(
		client,
		`(() => {
			const leaf = ${JSON.stringify(mode)} === 'preview' ? window.app.workspace.getLeaf('tab') : (window.app.workspace.activeLeaf ?? window.app.workspace.getLeaf(false));
			const file = window.app.workspace.getActiveFile() ?? window.app.vault.getAbstractFileByPath(${JSON.stringify(NOTE_PATH)});
			if (${JSON.stringify(mode)} === 'preview') {
				setTimeout(() => void Promise.resolve(leaf.openFile(file, { active: true, state: { mode: 'preview' } })).catch(() => undefined), 0);
			}
			void Promise.resolve(leaf.setViewState({ type: 'markdown', state: { file: file.path, mode: ${JSON.stringify(mode)}, source: ${JSON.stringify(source)} }, active: true }, { history: false })).catch(() => undefined);
			window.app.workspace.setActiveLeaf?.(leaf, { focus: true });
			return true;
		})()`,
		`request ${mode}`,
	);
	const selector = mode === 'preview'
		? '.markdown-preview-view'
		: source
			? '.markdown-source-view.mod-cm6:not(.is-live-preview)'
			: '.markdown-source-view.mod-cm6.is-live-preview';
	await waitFor(
		client,
		`window.app.workspace.getActiveFile()?.path === ${JSON.stringify(NOTE_PATH)} && Boolean(window.app.workspace.activeLeaf?.view?.containerEl?.querySelector(${JSON.stringify(selector)}))`,
		`wait for ${mode}`,
	);
	await delay(500);
}

async function ensureObsidianVisible(client) {
	await evaluate(
		client,
		`(() => {
			const win = globalThis.electronWindow;
			win?.show?.();
			win?.restore?.();
			win?.setBounds?.({ x: 100, y: 100, width: 430, height: 900 });
			win?.focus?.();
			return true;
		})()`,
		'ensure Obsidian visible',
	);
	await waitFor(client, `document.visibilityState === 'visible'`, 'wait for visible Obsidian window', 10000);
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
			void Promise.resolve(window.app.workspace.getLeaf(false).openFile(file)).catch(() => undefined);
			window.app.workspace.leftSplit?.collapse?.();
			window.app.workspace.rightSplit?.collapse?.();
			document.getElementById('shiki-narrow-scroll-regression-style')?.remove();
			const plugin = window.app.plugins.plugins['advanced-code-block'];
			if (plugin) {
				plugin.settings.wrapLines = false;
				plugin.settings.showLineNumbers = true;
				plugin.loadedSettings = structuredClone(plugin.settings);
				await plugin.saveData(plugin.settings);
			}
			plugin?.registerInlineCodeProcessor?.();
			plugin?.registerCodeBlockProcessors?.();
			plugin?.registerCm6Plugin?.();
			return true;
		})()`,
		'setup fixture',
	);
	await delay(1000);
}

async function verifyLivePreviewViewing(client) {
	await requestMode(client, 'source', false);
	const state = await evaluate(
		client,
		`(async () => {
			const leaf = window.app.workspace.activeLeaf;
			await new Promise(resolve => setTimeout(resolve, 1000));
			const root = leaf.view.containerEl;
			const isMobile = window.app.isMobile === true;
			const scroller = root.querySelector('.cm-scroller');
			if (scroller) scroller.scrollLeft = 0;
			const header = root.querySelector('.shiki-live-preview-header');
			const sharedScroll = root.querySelector('.shiki-live-preview-horizontal-scroll');
			const openingFence = root.querySelector('.cm-line.shiki-live-preview-opening-fence-line');
			const closingFence = root.querySelector('.cm-line.shiki-live-preview-closing-fence-line');
			const codeRows = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line')];
			const firstContent = codeRows[0]?.querySelector('.shiki-live-preview-scroll-content');
			const tokenColor = token => {
				const span = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line [style*="color:"]')].find(el => el.textContent === token);
				return span ? getComputedStyle(span).color : null;
			};
			const lineNumbers = [...root.querySelectorAll('.shiki-live-preview-line-number')];
			const visibleGutters = [...root.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].filter(el => getComputedStyle(el).visibility !== 'hidden');
			const blockRect = openingFence && closingFence ? { top: openingFence.getBoundingClientRect().top, bottom: closingFence.getBoundingClientRect().bottom } : null;
			const blockGutters = blockRect
				? visibleGutters.filter(el => {
					const rect = el.getBoundingClientRect();
					return rect.bottom > blockRect.top - 1 && rect.top < blockRect.bottom + 1;
				})
				: [];
			const lineNumberStyle = lineNumbers[0] ? getComputedStyle(lineNumbers[0]) : null;
			if (sharedScroll) sharedScroll.scrollLeft = 0;
			await new Promise(resolve => setTimeout(resolve, 50));
			const beforeLineLeft = lineNumbers[0]?.getBoundingClientRect().left ?? null;
			const beforeCodeLeft = firstContent?.getBoundingClientRect().left ?? null;
			if (sharedScroll) {
				sharedScroll.scrollLeft = 260;
				sharedScroll.dispatchEvent(new Event('scroll'));
			}
			await new Promise(resolve => setTimeout(resolve, 50));
			const afterLineLeft = lineNumbers[0]?.getBoundingClientRect().left ?? null;
			const afterCodeLeft = firstContent?.getBoundingClientRect().left ?? null;
			if (sharedScroll) sharedScroll.scrollLeft = 0;
			sharedScroll?.dispatchEvent(new Event('scroll'));
			await new Promise(resolve => setTimeout(resolve, 50));
			const beforeTouchCodeLeft = firstContent?.getBoundingClientRect().left ?? null;
			const panRow = codeRows[0];
			const panRect = panRow?.getBoundingClientRect();
			if (panRow && panRect) {
				const pointerInit = { bubbles: true, cancelable: true, pointerId: 91, pointerType: 'touch', clientX: panRect.left + 220, clientY: panRect.top + panRect.height / 2 };
				panRow.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
				panRow.dispatchEvent(new PointerEvent('pointermove', { ...pointerInit, clientX: panRect.left + 60 }));
				panRow.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, clientX: panRect.left + 60 }));
			}
			await new Promise(resolve => setTimeout(resolve, 50));
			const afterTouchCodeLeft = firstContent?.getBoundingClientRect().left ?? null;
			const touchPanScrollLeft = sharedScroll?.scrollLeft ?? 0;
			return {
				hasHeader: !!header,
				hasSharedScroll: !!sharedScroll,
				sharedScrollClient: sharedScroll?.clientWidth ?? 0,
				sharedScrollWidth: sharedScroll?.scrollWidth ?? 0,
				sharedScrollLeft: sharedScroll?.scrollLeft ?? 0,
				scrollbarScrollLeft: 260,
				touchPanScrollLeft,
				visibleCodeLineCount: root.querySelectorAll('.cm-line.shiki-live-preview-code-line').length,
				visibleGutterCount: visibleGutters.length,
				blockGutterCount: blockGutters.length,
				blockGutterValues: blockGutters.map(el => el.textContent),
				rowScrollLefts: codeRows.map(el => el.scrollLeft),
				sharedOffsets: codeRows.map(el => getComputedStyle(el).getPropertyValue('--shiki-live-preview-scroll-left').trim()),
				lineNumberCount: lineNumbers.length,
				lineNumberValues: lineNumbers.map(el => el.textContent),
				openingFenceText: openingFence?.querySelector('.shiki-live-preview-fence-text')?.textContent ?? null,
				closingFenceText: closingFence?.querySelector('.shiki-live-preview-fence-text')?.textContent ?? null,
				headerBeforeOpeningFence: !!header && !!openingFence && header.getBoundingClientRect().bottom <= openingFence.getBoundingClientRect().top + 1,
				lineNumberBackground: lineNumberStyle?.backgroundColor ?? null,
				lineMoved: beforeLineLeft !== null && afterLineLeft !== null ? beforeLineLeft - afterLineLeft : 0,
				codeMoved: beforeCodeLeft !== null && afterCodeLeft !== null ? beforeCodeLeft - afterCodeLeft : 0,
				touchCodeMoved: beforeTouchCodeLeft !== null && afterTouchCodeLeft !== null ? beforeTouchCodeLeft - afterTouchCodeLeft : 0,
				anyLineOwnScroll: codeRows.some(el => el.scrollLeft > 0),
				noteScrollLeft: scroller?.scrollLeft ?? 0,
				constColor: tokenColor('const'),
				identifierColor: tokenColor('insanelyLongValueName'),
			};
		})()`,
		'live preview viewing',
	);
	assert(state.hasHeader, 'Live Preview viewing did not render a Shiki header', state);
	assert(state.hasSharedScroll, 'Live Preview viewing did not render one shared block horizontal scrollbar', state);
	assert(state.visibleCodeLineCount === 2, 'Live Preview viewing did not preserve native CodeMirror code rows', state);
	assert(state.visibleGutterCount > 0, 'Live Preview viewing hid note gutter line numbers', state);
	assert(state.blockGutterCount === 4, 'Live Preview viewing did not preserve native note gutter rows for the fenced range', state);
	assert(state.sharedScrollWidth > state.sharedScrollClient, 'Live Preview viewing shared scrollbar is not horizontally scrollable', state);
	assert(state.scrollbarScrollLeft > 0, 'Live Preview viewing shared scrollbar did not scroll horizontally', state);
	assert(state.touchPanScrollLeft > 0, 'Live Preview viewing code row touch pan did not move the shared scrollbar', state);
	assert(state.lineNumberCount === 2, 'Live Preview viewing internal line numbers include fence lines or omit code lines', state);
	assert(JSON.stringify(state.lineNumberValues) === JSON.stringify(['1', '2']), 'Live Preview viewing internal line numbers do not count only code content lines', state);
	assert(state.openingFenceText === '```ts', 'Live Preview viewing did not show the opening fence with language below the header', state);
	assert(state.closingFenceText === '```', 'Live Preview viewing did not show the closing fence', state);
	assert(state.headerBeforeOpeningFence, 'Live Preview viewing did not render the header above the opening fence', state);
	assert(Math.abs(state.lineMoved) < 1, 'Live Preview viewing moved line numbers horizontally', state);
	assert(isOpaqueColor(state.lineNumberBackground), 'Live Preview viewing line number gutter is transparent', state);
	assert(state.codeMoved > 0 || state.touchCodeMoved > 0, 'Live Preview viewing did not move code content horizontally', state);
	assert(!state.anyLineOwnScroll, 'Live Preview viewing left horizontal scroll on individual lines', state);
	assert(state.rowScrollLefts.every(value => value === 0), 'Live Preview viewing used per-line scrollLeft', state);
	assert(new Set(state.sharedOffsets).size === 1 && state.sharedOffsets[0] === `${state.touchPanScrollLeft}px`, 'Live Preview viewing code rows do not share one scroll offset', state);
	assert(state.noteScrollLeft === 0, 'Live Preview viewing moved the note horizontally', state);
	return state;
}

async function verifyLivePreviewEditing(client) {
	await requestMode(client, 'source', false);
	const state = await evaluate(
		client,
		`(async () => {
			const leaf = window.app.workspace.activeLeaf;
			const isMobile = window.app.isMobile === true;
			void Promise.resolve(window.app.plugins.plugins['advanced-code-block']?.updateCm6Plugin?.()).catch(() => undefined);
			await new Promise(resolve => setTimeout(resolve, 1000));
			const root = leaf.view.containerEl;
			const scroller = root.querySelector('.cm-scroller');
			if (scroller) scroller.scrollLeft = 0;
			const header = root.querySelector('.shiki-live-preview-header');
			const sharedScroll = root.querySelector('.shiki-live-preview-horizontal-scroll');
			if (sharedScroll) {
				sharedScroll.scrollLeft = 260;
				sharedScroll.dispatchEvent(new Event('scroll'));
			}
			await new Promise(resolve => setTimeout(resolve, 50));
			const beforeTop = header?.getBoundingClientRect().top ?? null;
			const beforeHeight = header?.getBoundingClientRect().height ?? null;
			const codeLine = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line')].find(el => el.textContent?.includes('insanelyLongValueName'));
			const rect = codeLine?.getBoundingClientRect();
			if (codeLine && rect) {
				const clickX = rect.left + Math.min(180, Math.max(40, rect.width - 40));
				const clickY = rect.top + rect.height / 2;
				codeLine.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
				codeLine.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
				codeLine.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: clickX, clientY: clickY }));
			}
			await new Promise(resolve => setTimeout(resolve, 500));
			const cursorBeforeEdit = leaf.view.editor.getCursor();
			const samples = [];
			const firstHeader = root.querySelector('.shiki-live-preview-header');
			let sampling = true;
			const sampler = new Promise(resolve => {
				const tick = () => {
					const currentHeader = root.querySelector('.shiki-live-preview-header');
					samples.push({
						sameHeader: currentHeader === firstHeader,
						sharedScrollLeft: root.querySelector('.shiki-live-preview-horizontal-scroll')?.scrollLeft ?? null,
						nativeLineCount: root.querySelectorAll('.cm-line.shiki-live-preview-code-line').length,
					});
					if (sampling) setTimeout(tick, 16);
					else resolve();
				};
				setTimeout(tick, 16);
			});
			leaf.view.editor.replaceRange('__EDIT__', leaf.view.editor.getCursor());
			await new Promise(resolve => setTimeout(resolve, 750));
			sampling = false;
			await sampler;
			const updatedHeader = root.querySelector('.shiki-live-preview-header');
			const updatedSharedScroll = root.querySelector('.shiki-live-preview-horizontal-scroll');
			const cursor = leaf.view.editor.getCursor();
			const editedLine = leaf.view.editor.getLine(cursor.line);
			const nativeLines = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line')].filter(el => el.textContent?.includes('LongValueName'));
			const tokenCount = root.querySelectorAll('.cm-line.shiki-live-preview-code-line [style*="color:"]').length;
			const contentAfterEdit = leaf.view.editor.getValue();
			await new Promise(resolve => setTimeout(resolve, 250));
			return {
				label: 'live-preview-editing',
				isMobile,
				hadHeader: !!header,
				activeCodeMirror: document.activeElement?.classList?.contains('cm-content') ?? false,
				mobileToolbarOpen: document.body.classList.contains('mod-toolbar-open') && !!document.querySelector('.mobile-toolbar'),
				contentIncludesEdit: contentAfterEdit.includes('__EDIT__'),
				cursorBeforeEdit,
				cursor,
				editedLine,
				nativeLineCount: nativeLines.length,
				scrollerScrollLeft: scroller?.scrollLeft ?? 0,
				sharedScrollLeft: updatedSharedScroll?.scrollLeft ?? 0,
				tokenCount,
				virtualScrollRows: root.querySelectorAll('.shiki-editing-codeblock-active-line-nowrap, .shiki-live-preview-code-line-nowrap[style*="--shiki-editing-scroll-left"]').length,
				anyLineOwnScroll: nativeLines.some(el => el.scrollLeft > 0),
				documentScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
				topDelta: beforeTop !== null && updatedHeader ? Math.abs(updatedHeader.getBoundingClientRect().top - beforeTop) : null,
				heightDelta: beforeHeight !== null && updatedHeader ? Math.abs(updatedHeader.getBoundingClientRect().height - beforeHeight) : null,
				unstableSampleCount: samples.filter(sample => sample.nativeLineCount !== 2 || Math.abs((sample.sharedScrollLeft ?? 0) - 260) > 1).length,
				sampleCount: samples.length,
			};
		})()`,
		'live preview editing',
	);
	assert(state.hadHeader, 'Live Preview editing did not start from a rendered Shiki header', state);
	if (state.isMobile) {
		assert(state.activeCodeMirror || state.mobileToolbarOpen, 'Live Preview mobile editing did not focus native editing controls', state);
	} else {
		assert(state.activeCodeMirror, 'Live Preview editing did not focus native CodeMirror editing', state);
	}
	assert(state.contentIncludesEdit, 'Live Preview editing did not write through to the Obsidian document', state);
	assert(state.cursor.line === state.cursorBeforeEdit.line, 'Live Preview editing moved the cursor to a different line during input', state);
	assert(state.editedLine.includes('__EDIT__'), 'Live Preview editing did not write into the visible clicked code line', state);
	assert(state.nativeLineCount === 2, 'Live Preview editing did not preserve native code rows', state);
	assert(state.scrollerScrollLeft === 0, 'Live Preview editing moved the whole editor horizontally', state);
	assert(state.sharedScrollLeft > 0, 'Live Preview editing did not preserve shared horizontal scroll', state);
	assert(state.tokenCount > 0, 'Live Preview editing block is not Shiki-tokenized', state);
	assert(state.virtualScrollRows === 0, 'Live Preview editing still uses virtual per-line horizontal scrolling', state);
	assert(!state.anyLineOwnScroll, 'Live Preview editing left horizontal scroll on individual lines', state);
	assert(state.documentScrollLeft === 0, 'Live Preview editing moved the document horizontally', state);
	assert(state.topDelta !== null && state.topDelta < 2, 'Live Preview editing moved the block vertically during input', state);
	assert(state.heightDelta !== null && state.heightDelta < 2, 'Live Preview editing changed the block height during input', state);
	assert(state.sampleCount > 0, 'Live Preview editing stability sampler did not run', state);
	assert(state.unstableSampleCount === 0, 'Live Preview editing recreated the block editor, lost focus, reset scroll, or revealed native rows during input', state);
	return state;
}

async function verifySourceMode(client) {
	await requestMode(client, 'source', true);
	const state = await evaluate(client, blockScrollExpression('source', true), 'source mode');
	assertBlockScrollerState(state, 'Source mode');
	return state;
}

async function verifyReadingMode(client) {
	await requestMode(client, 'preview', false);
	await evaluate(
		client,
		`(async () => {
			const leaf = window.app.workspace.activeLeaf;
			const file = window.app.vault.getAbstractFileByPath(${JSON.stringify(NOTE_PATH)});
			await Promise.race([
				Promise.resolve(leaf.openFile(file, { active: true, state: { mode: 'preview' } })),
				new Promise(resolve => setTimeout(resolve, 4000)),
			]);
			return true;
		})()`,
		'reading mode open file',
	);
	const state = await evaluate(
		client,
		`(async () => {
			const leaf = window.app.workspace.activeLeaf;
			await new Promise(resolve => setTimeout(resolve, 1000));
			const root = leaf.view.containerEl;
			const scroller = root.querySelector('.markdown-preview-view');
			const previewTextLength = scroller?.textContent?.trim().length ?? 0;
			const nativePreCount = root.querySelectorAll('.markdown-preview-view pre').length;
			if (scroller) scroller.scrollLeft = 0;
			const blocks = [...root.querySelectorAll('.shiki-reading-block')];
			const block = blocks[0];
			const directHeaders = block ? [...block.children].filter(el => el.matches('.shiki-block-header')) : [];
			const directBodies = block ? [...block.children].filter(el => el.matches('.shiki-block-body')) : [];
			const body = directBodies[0];
			const codeScroll = body?.querySelector('.shiki-code-scroll');
			const lineNumbers = body?.querySelector('.shiki-line-numbers');
			const tokenColor = token => {
				const span = [...(body?.querySelectorAll('[style*="color:"]') ?? [])].find(el => el.textContent === token);
				return span ? getComputedStyle(span).color : null;
			};
			const pre = body?.querySelector('pre');
			const code = body?.querySelector('code');
			const preStyle = pre ? getComputedStyle(pre) : null;
			const lineNumberStyle = lineNumbers ? getComputedStyle(lineNumbers) : null;
			const codeScrollStyle = codeScroll ? getComputedStyle(codeScroll) : null;
			const visibleNativeCopyButtons = body
				? [...body.querySelectorAll('.copy-code-button')].filter(button => getComputedStyle(button).display !== 'none')
				: [];
			const beforeLineLeft = lineNumbers?.getBoundingClientRect().left ?? null;
			const beforeCodeLeft = code?.getBoundingClientRect().left ?? null;
			if (body) body.scrollLeft = 260;
			const afterLineLeft = lineNumbers?.getBoundingClientRect().left ?? null;
			const afterCodeLeft = code?.getBoundingClientRect().left ?? null;
			return {
				skipped: blocks.length === 0 && previewTextLength === 0 && nativePreCount === 0,
				previewTextLength,
				nativePreCount,
				blockCount: blocks.length,
				directHeaderCount: directHeaders.length,
				directBodyCount: directBodies.length,
				bodyClient: body?.clientWidth ?? 0,
				bodyScrollWidth: body?.scrollWidth ?? 0,
				bodyScrollLeft: body?.scrollLeft ?? 0,
				codeScrollLeft: codeScroll?.scrollLeft ?? 0,
				prePaddingLeft: preStyle ? Number.parseFloat(preStyle.paddingLeft) || 0 : null,
				prePaddingTop: preStyle ? Number.parseFloat(preStyle.paddingTop) || 0 : null,
				preBorderLeft: preStyle ? Number.parseFloat(preStyle.borderLeftWidth) || 0 : null,
				preBorderTop: preStyle ? Number.parseFloat(preStyle.borderTopWidth) || 0 : null,
				visibleNativeCopyButtonCount: visibleNativeCopyButtons.length,
				lineNumberBackground: lineNumberStyle?.backgroundColor ?? null,
				lineNumberBoxShadow: lineNumberStyle?.boxShadow ?? null,
				codeScrollPaddingLeft: codeScrollStyle ? Number.parseFloat(codeScrollStyle.paddingLeft) || 0 : null,
				lineMoved: beforeLineLeft !== null && afterLineLeft !== null ? beforeLineLeft - afterLineLeft : 0,
				codeMoved: beforeCodeLeft !== null && afterCodeLeft !== null ? beforeCodeLeft - afterCodeLeft : 0,
				noteScrollLeft: scroller?.scrollLeft ?? 0,
				constColor: tokenColor('const'),
				identifierColor: tokenColor('insanelyLongValueName'),
			};
		})()`,
		'reading mode',
	);
	assert(state.blockCount === 1, 'Reading mode did not render exactly one Shiki block', state);
	assert(state.directHeaderCount === 1, 'Reading mode rendered duplicate or missing direct block headers', state);
	assert(state.directBodyCount === 1, 'Reading mode rendered duplicate or missing direct block bodies', state);
	assert(state.bodyScrollWidth > state.bodyClient, 'Reading mode block body is not horizontally scrollable', state);
	assert(state.bodyScrollLeft > 0, 'Reading mode block body did not scroll', state);
	assert(state.prePaddingLeft === 0 && state.prePaddingTop === 0, 'Reading mode kept native pre padding inside the Shiki block', state);
	assert(state.preBorderLeft === 0 && state.preBorderTop === 0, 'Reading mode kept native pre border inside the Shiki block', state);
	assert(state.visibleNativeCopyButtonCount === 0, 'Reading mode kept Obsidian native copy button inside the Shiki block body', state);
	assert(Math.abs(state.lineMoved) < 1, 'Reading mode moved line numbers horizontally', state);
	assert(isOpaqueColor(state.lineNumberBackground), 'Reading mode line number gutter is transparent', state);
	assert(state.lineNumberBoxShadow === 'none', 'Reading mode line number gutter uses an overflow shadow strip', state);
	assert(state.codeScrollPaddingLeft > 0, 'Reading mode code column has no gutter spacer padding', state);
	assert(state.codeMoved > 0, 'Reading mode did not move code content horizontally', state);
	assert(state.codeScrollLeft === 0, 'Reading mode scrolled the inner code column instead of the block body', state);
	assert(state.noteScrollLeft === 0, 'Reading mode moved the note horizontally', state);
	return state;
}

function blockScrollExpression(label, source) {
	return `(async () => {
		const leaf = window.app.workspace.activeLeaf;
		const editor = leaf.view.editor;
		const line = editor.getValue().split('\\n').findIndex(value => value.includes('insanelyLongValueName'));
		editor.setCursor({ line, ch: 20 });
		editor.focus();
		await new Promise(resolve => setTimeout(resolve, 1000));
		const root = leaf.view.containerEl;
		const scroller = root.querySelector('.cm-scroller');
		const content = root.querySelector('.cm-content');
		if (scroller) scroller.scrollLeft = 0;
		const lines = [...root.querySelectorAll(${source ? "'.cm-content .cm-line'" : "'.shiki-editing-codeblock-active-line-nowrap'"})].filter(el => el.textContent?.includes('LongValueName'));
		const codeLines = ${source ? "[...root.querySelectorAll('.cm-content .cm-line.HyperMD-codeblock, .cm-content .cm-line.HyperMD-codeblock-bg')]" : '[]'};
		const tokenColor = token => {
			const span = [...root.querySelectorAll('.cm-content .cm-line.HyperMD-codeblock [style*="color:"]')].find(el => el.textContent === token);
			return span ? getComputedStyle(span).color : null;
		};
		const before = lines.map(el => el.getBoundingClientRect().left);
		if (scroller) scroller.scrollLeft = 300;
		const after = lines.map(el => el.getBoundingClientRect().left);
		return {
			label: ${JSON.stringify(label)},
			lineCount: lines.length,
			scrollerClient: scroller?.clientWidth ?? 0,
			scrollerScrollWidth: scroller?.scrollWidth ?? 0,
			scrollerScrollLeft: scroller?.scrollLeft ?? 0,
			contentWidth: content?.getBoundingClientRect().width ?? 0,
			codeLineWidths: codeLines.map(el => el.getBoundingClientRect().width),
			lineMoved: before.map((left, index) => left - after[index]),
			anyLineOwnScroll: lines.some(el => el.scrollLeft > 0),
			bodyScrollLeft: document.scrollingElement?.scrollLeft ?? 0,
			constColor: tokenColor('const'),
			identifierColor: tokenColor('insanelyLongValueName'),
		};
	})()`;
}

function assertColorParity(livePreview, sourceMode, readingMode) {
	assert(livePreview.constColor && sourceMode.constColor && readingMode.constColor, 'Missing const token color in one or more modes', { livePreview, sourceMode, readingMode });
	assert(livePreview.identifierColor && sourceMode.identifierColor && readingMode.identifierColor, 'Missing identifier token color in one or more modes', {
		livePreview,
		sourceMode,
		readingMode,
	});
	assert(
		livePreview.constColor === sourceMode.constColor && sourceMode.constColor === readingMode.constColor,
		'const token color differs across Live Preview, Source, and Reading modes',
		{ livePreview, sourceMode, readingMode },
	);
	assert(
		livePreview.identifierColor === sourceMode.identifierColor && sourceMode.identifierColor === readingMode.identifierColor,
		'identifier token color differs across Live Preview, Source, and Reading modes',
		{ livePreview, sourceMode, readingMode },
	);
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
	if (label === 'Source mode') {
		assert(state.codeLineWidths.length > 0, `${label} did not find source code block lines`, state);
		assert(
			state.codeLineWidths.every(width => Math.abs(width - state.contentWidth) < 2),
			`${label} left variable-width code line backgrounds`,
			state,
		);
	}
	assert(state.bodyScrollLeft === 0, `${label} moved the document horizontally`, state);
}

async function main() {
	const client = await connectToExistingObsidian();
	try {
		await client.send('Runtime.enable');
		await ensureObsidianVisible(client);
		await setupFixture(client);
		const livePreviewViewing = await verifyLivePreviewViewing(client);
		const livePreviewEditing = await verifyLivePreviewEditing(client);
		const sourceMode = await verifySourceMode(client);
		const readingMode = await verifyReadingMode(client);
		assertColorParity(livePreviewViewing, sourceMode, readingMode);
		console.log(JSON.stringify({ ok: true, livePreviewViewing, livePreviewEditing, sourceMode, readingMode }, null, 2));
	} finally {
		client.close();
	}
}

main().catch(error => {
	console.error(`verify:obsidian-codeblock-horizontal-scroll-regression failed: ${error.stack ?? error.message}`);
	process.exit(1);
});
