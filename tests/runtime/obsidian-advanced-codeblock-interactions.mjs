#!/usr/bin/env node

const DEFAULT_PORT = 9230;
const PORT = Number(process.env.OBSIDIAN_DEBUG_PORT ?? DEFAULT_PORT);

async function delay(ms) {
	await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`);
	}
	return response.json();
}

async function connectToExistingObsidian(port) {
	const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
	const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
	if (!page) {
		throw new Error(`No Obsidian page target is listening on CDP port ${port}`);
	}

	const ws = new WebSocket(page.webSocketDebuggerUrl);
	let id = 0;
	const pending = new Map();

	ws.onmessage = event => {
		const message = JSON.parse(event.data);
		if (!message.id || !pending.has(message.id)) {
			return;
		}
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) {
			reject(new Error(JSON.stringify(message.error)));
		} else {
			resolve(message.result);
		}
	};

	await new Promise((resolve, reject) => {
		ws.onopen = resolve;
		ws.onerror = reject;
	});

	return {
		async send(method, params = {}) {
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
	const result = await client.send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails));
	}
	return result.result.value;
}

function assert(condition, message, details) {
	if (!condition) {
		const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
		throw new Error(`${message}${suffix}`);
	}
}

function asFiniteNumber(value, label) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		throw new Error(`Invalid CDP coordinate for ${label}: ${String(value)}`);
	}
	return numeric;
}

function findNoteScrollerScript() {
	return `
		const fallbackScroller =
			document.querySelector('.workspace-leaf.mod-active .markdown-source-view .cm-scroller') ??
			document.querySelector('.workspace-leaf.mod-active .markdown-reading-view .markdown-preview-view') ??
			document.querySelector('.workspace-leaf.mod-active .cm-scroller') ??
			document.querySelector('.cm-scroller, .markdown-preview-view');
		let scroller = block?.parentElement ?? null;
		while (scroller && scroller !== document.body) {
			if (scroller.scrollHeight > scroller.clientHeight + 1 && !scroller.classList.contains('shiki-code-scroll')) {
				break;
			}
			scroller = scroller.parentElement;
		}
		if (!scroller || scroller === document.body) {
			scroller = fallbackScroller;
		}
	`;
}

async function openProbeNote(client) {
	const longSegment = 'abcdefghijklmnopqrstuvwxyz0123456789_'.repeat(8);
	const content = [
		'# Live Preview Interaction Probe',
		'',
		'above '.repeat(90),
		'',
		'```ts',
		`const alpha = ${JSON.stringify(longSegment)};`,
		`const beta = ${JSON.stringify(longSegment)};`,
		`const gamma = ${JSON.stringify(longSegment)};`,
		'```',
		'',
		'below '.repeat(160),
	].join('\n');

	return evaluate(
		client,
		`(async () => {
			if (!window.app?.vault || !window.app?.workspace) {
				throw new Error('Obsidian app is not ready');
			}
			const path = 'codex-live-preview-interactions.md';
			const content = ${JSON.stringify(content)};
			let file = app.vault.getAbstractFileByPath(path);
			if (!file) {
				file = await app.vault.create(path, content);
			} else {
				await app.vault.modify(file, content);
			}
			const leaf = app.workspace.getLeaf(false);
			await leaf.setViewState({
				type: 'markdown',
				state: { file: path, mode: 'source', source: false },
				active: true,
			});
			await new Promise(resolve => setTimeout(resolve, 2500));
			return {
				activeFile: app.workspace.getActiveFile()?.path ?? null,
				mode: leaf.view.getState?.()?.mode ?? null,
				source: leaf.view.getState?.()?.source ?? null,
				shikiBlocks: document.querySelectorAll('.shiki-live-preview-block').length,
			};
		})()`,
	);
}

async function applyPluginSettings(client, settings) {
	await evaluate(
		client,
		`(async () => {
			const plugin = window.app?.plugins?.plugins?.['advanced-code-block'];
			if (!plugin) throw new Error('advanced-code-block is not loaded');
			if (${JSON.stringify(Object.hasOwn(settings, 'wrap'))}) {
				plugin.settings.wrapLines = ${JSON.stringify(settings.wrap)};
			}
			if (${JSON.stringify(Object.hasOwn(settings, 'lineNumbers'))}) {
				plugin.settings.showLineNumbers = ${JSON.stringify(settings.lineNumbers)};
			}
			plugin.loadedSettings = structuredClone(plugin.settings);
			await plugin.saveData(plugin.settings);
			return true;
		})()`,
	);
}

async function normalizeDesktopViewport(client) {
	await evaluate(client, `globalThis.app?.emulateMobile?.(false); true`);
	await client.send('Emulation.setDeviceMetricsOverride', {
		width: 1200,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await delay(500);
}

async function normalizeMobileViewport(client) {
	await client.send('Emulation.setDeviceMetricsOverride', {
		width: 390,
		height: 844,
		deviceScaleFactor: 3,
		mobile: true,
	});
	await evaluate(client, `globalThis.app?.emulateMobile?.(true); true`);
	await delay(900);
}

async function getInteractionState(client) {
	return evaluate(
		client,
		`(() => {
			const block = document.querySelector('.shiki-live-preview-block');
			const scrollContainer = block?.querySelector('.shiki-code-scroll');
			${findNoteScrollerScript()}
			const rect = block?.getBoundingClientRect?.();
			return {
				hasBlock: !!block,
				hasScrollContainer: !!scrollContainer,
				shikiBlocks: document.querySelectorAll('.shiki-live-preview-block').length,
				rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
				noteScrollTop: scroller?.scrollTop ?? null,
				codeScrollLeft: scrollContainer?.scrollLeft ?? null,
				codeScrollTop: scrollContainer?.scrollTop ?? null,
				activeElement: {
					tag: document.activeElement?.tagName ?? null,
					className: String(document.activeElement?.className ?? ''),
				},
			};
		})()`,
	);
}

async function dispatchWheel(client, x, y, deltaX, deltaY) {
	await client.send('Input.dispatchMouseEvent', {
		type: 'mouseWheel',
		x: asFiniteNumber(x, 'mouseWheel.x'),
		y: asFiniteNumber(y, 'mouseWheel.y'),
		deltaX: asFiniteNumber(deltaX, 'mouseWheel.deltaX'),
		deltaY: asFiniteNumber(deltaY, 'mouseWheel.deltaY'),
	});
	await delay(250);
}

async function dispatchDrag(client, startX, startY, endX, endY) {
	const fromX = asFiniteNumber(startX, 'drag.startX');
	const fromY = asFiniteNumber(startY, 'drag.startY');
	const toX = asFiniteNumber(endX, 'drag.endX');
	const toY = asFiniteNumber(endY, 'drag.endY');
	await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fromX, y: fromY, button: 'none' });
	await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', clickCount: 1 });
	await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: toX, y: toY, button: 'left' });
	await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left', clickCount: 1 });
	await delay(250);
}

async function setNoteScrollTop(client, scrollTop) {
	await evaluate(
		client,
		`(() => {
			const block = document.querySelector('.shiki-live-preview-block');
			${findNoteScrollerScript()}
			if (!scroller || scroller === document.body) {
				throw new Error('No active note scroller found');
			}
			scroller.scrollTop = ${JSON.stringify(scrollTop)};
		})()`,
	);
	await delay(250);
}

async function click(client, x, y) {
	const clickX = asFiniteNumber(x, 'click.x');
	const clickY = asFiniteNumber(y, 'click.y');
	await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX, y: clickY, button: 'none' });
	await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
	await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
	await delay(600);
}

async function tap(client, x, y) {
	const tapX = asFiniteNumber(x, 'tap.x');
	const tapY = asFiniteNumber(y, 'tap.y');
	await client.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ x: tapX, y: tapY, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
	});
	await delay(50);
	await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await delay(300);
}

async function getHeaderState(client) {
	return evaluate(
		client,
		`(() => {
			const block = document.querySelector('.shiki-live-preview-block');
			const header = block?.querySelector('.shiki-block-header');
			const copyButton = header?.querySelector('button');
			return {
				headerVisible: !!header,
				copyButtonVisible: !!copyButton,
				hasBlock: !!block,
			};
		})()`,
	);
}

async function installClipboardProbe(client) {
	await evaluate(
		client,
		`(() => {
			window.__codexSelectionClipboardText = null;
			const capture = text => {
				window.__codexSelectionClipboardText = String(text ?? '');
			};
			try {
				const clipboard = navigator.clipboard ?? {};
				Object.defineProperty(clipboard, 'writeText', {
					configurable: true,
					value: async text => capture(text),
				});
				Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
			} catch {
				// Some embedded browser builds expose navigator.clipboard as non-configurable.
			}
			const originalExecCommand = document.execCommand?.bind(document);
			document.execCommand = command => {
				if (command === 'copy') {
					const block = document.querySelector('.shiki-live-preview-block');
					const codeContent = block?.querySelector('.shiki-code-scroll')?.textContent ?? '';
					capture(codeContent);
					return true;
				}
				return originalExecCommand?.(command) ?? false;
			};
		})()`,
	);
}

async function getClipboardProbeText(client) {
	return evaluate(client, `(() => window.__codexSelectionClipboardText ?? '')()`);
}

async function clickCopyButton(client) {
	await evaluate(
		client,
		`(() => {
			const block = document.querySelector('.shiki-live-preview-block');
			const header = block?.querySelector('.shiki-block-header');
			const button = header?.querySelector('button');
			if (!button) {
				throw new Error('Copy button not found in Shiki block header');
			}
			button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
			button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		})()`,
	);
	await delay(300);
}

async function waitForUsableInteractionState(client) {
	for (let attempt = 0; attempt < 20; attempt++) {
		const state = await getInteractionState(client);
		if (state.hasBlock && state.hasScrollContainer && state.rect && state.rect.width > 80 && state.rect.height > 40) {
			return state;
		}
		await delay(250);
	}
	return getInteractionState(client);
}

async function assertStableLivePreviewSurfaceAfterRerenders(client) {
	const before = await getInteractionState(client);
	assert(before.shikiBlocks === 1, 'Live Preview stability setup has duplicate Shiki surfaces', before);
	const stability = await evaluate(
		client,
		`(async () => {
			const block = document.querySelector('.shiki-live-preview-block');
			const scrollContainer = block?.querySelector('.shiki-code-scroll');
			if (!block || !scrollContainer) return { missing: true };
			block.dataset.stabilityProbe = 'stable-block';
			scrollContainer.dataset.stabilityProbe = 'stable-scroll';
			for (let i = 0; i < 5; i++) {
				window.dispatchEvent(new Event('resize'));
				await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			}
			return {
				shikiBlocks: document.querySelectorAll('.shiki-live-preview-block').length,
				stableBlock: document.querySelector('[data-stability-probe="stable-block"]') !== null,
				stableScroll: document.querySelector('[data-stability-probe="stable-scroll"]') !== null,
			};
		})()`,
	);
	assert(stability.shikiBlocks === 1, 'Live Preview rerenders grew duplicate Shiki surfaces', stability);
	assert(stability.stableBlock && stability.stableScroll, 'Live Preview rerenders replaced the stable Shiki surface', stability);
}

async function main() {
	const client = await connectToExistingObsidian(PORT);
	try {
		await client.send('Runtime.enable');
		await client.send('Page.enable');
		await client.send('Input.setIgnoreInputEvents', { ignore: false });

		const setup = await openProbeNote(client);
		assert(setup.activeFile === 'codex-live-preview-interactions.md', 'Probe note did not become active', setup);
		assert(setup.shikiBlocks === 1, 'Probe note should create exactly one Shiki block', setup);

		await normalizeDesktopViewport(client);
		await setNoteScrollTop(client, 0);

		let before = await waitForUsableInteractionState(client);
		assert(before.hasBlock && before.hasScrollContainer && before.rect, 'Shiki surface did not hydrate for probe note', before);
		assert(before.shikiBlocks === 1, 'Probe note mounted duplicate Shiki surfaces', before);

		await assertStableLivePreviewSurfaceAfterRerenders(client);
		before = await waitForUsableInteractionState(client);
		assert(before.rect && before.rect.width > 80, 'Shiki surface did not have a usable layout rectangle after rerender stability probe', before);

		let insideX = Math.round(before.rect.left + Math.min(before.rect.width - 20, 230));
		let insideY = Math.round(before.rect.top + Math.min(before.rect.height - 8, 30));

		await click(client, insideX, insideY);
		const afterClick = await getInteractionState(client);
		assert(afterClick.hasBlock, 'Click inside Live Preview Shiki block did not find the block', {
			before,
			afterClick,
		});

		await normalizeMobileViewport(client);
		const mobileSetup = await openProbeNote(client);
		assert(mobileSetup.activeFile === 'codex-live-preview-interactions.md', 'Mobile probe note did not become active', mobileSetup);
		before = await waitForUsableInteractionState(client);
		assert(before.rect && before.rect.width > 80, 'Mobile Shiki surface did not have usable layout rectangle', before);
		insideX = Math.round(before.rect.left + Math.min(before.rect.width - 20, 120));
		insideY = Math.round(before.rect.top + Math.min(before.rect.height - 8, 30));

		await tap(client, insideX, insideY);
		const afterTap = await getHeaderState(client);
		assert(afterTap.headerVisible, 'Tap did not show the Shiki block header', { afterTap });
		assert(afterTap.copyButtonVisible, 'Tap did not show the copy button', { afterTap });

		await normalizeDesktopViewport(client);
		await applyPluginSettings(client, { wrap: false, lineNumbers: false });
		const scrollSetup = await openProbeNote(client);
		assert(scrollSetup.activeFile === 'codex-live-preview-interactions.md', 'Desktop scroll probe note did not become active', scrollSetup);
		await setNoteScrollTop(client, 0);
		before = await waitForUsableInteractionState(client);
		assert(before.rect && before.rect.width > 80, 'Desktop scroll Shiki surface did not have usable layout rectangle', before);

		const scrollContainerRect = await evaluate(
			client,
			`(() => {
				const block = document.querySelector('.shiki-live-preview-block');
				const scrollContainer = block?.querySelector('.shiki-code-scroll');
				return scrollContainer?.getBoundingClientRect?.() ?? null;
			})()`,
		);
		if (scrollContainerRect) {
			const dragStartX = Math.round(scrollContainerRect.left + scrollContainerRect.width - 40);
			const dragStartY = Math.round(scrollContainerRect.top + 20);
			const dragEndX = Math.round(scrollContainerRect.left + 40);
			const dragEndY = dragStartY;
			await dispatchDrag(client, dragStartX, dragStartY, dragEndX, dragEndY);
		}
		const afterHorizontal = await getInteractionState(client);
		assert(afterHorizontal.codeScrollLeft > 0, 'Horizontal drag on the code scroll did not scroll Shiki horizontally', {
			before,
			afterHorizontal,
		});

		let insideWheelX = Math.round(before.rect.left + Math.min(before.rect.width - 20, 230));
		let insideWheelY = Math.round(before.rect.top + Math.min(before.rect.height - 8, 30));
		await dispatchWheel(client, insideWheelX, insideWheelY, 0, 600);
		const afterVerticalInside = await getInteractionState(client);
		assert(afterVerticalInside.noteScrollTop > before.noteScrollTop, 'Vertical wheel inside code did not scroll note', {
			before,
			afterVerticalInside,
		});
		assert(afterVerticalInside.codeScrollTop === 0, 'Vertical wheel inside code changed Shiki vertical scroll', {
			before,
			afterVerticalInside,
		});

		await setNoteScrollTop(client, 0);
		const beforeOutside = await getInteractionState(client);
		assert(beforeOutside.rect, 'Shiki surface rect disappeared before outside-scroll check', beforeOutside);

		const outsideX = Math.round(beforeOutside.rect.left + 30);
		const outsideY = Math.max(120, Math.round(beforeOutside.rect.top - 80));
		await dispatchWheel(client, outsideX, outsideY, 0, 600);
		const afterOutside = await getInteractionState(client);
		assert(afterOutside.noteScrollTop > beforeOutside.noteScrollTop, 'Vertical wheel outside code did not scroll note', {
			beforeOutside,
			afterOutside,
		});
		assert(afterOutside.shikiBlocks === 1, 'Shiki block count grew during interaction flow', {
			before,
			afterOutside,
		});

		await installClipboardProbe(client);
		await clickCopyButton(client);
		const copiedText = await getClipboardProbeText(client);
		assert(copiedText.length > 0 && copiedText.includes('abcdefghijklmnopqrstuvwxyz'), 'Copy button did not write Shiki code content to clipboard', {
			copiedText,
		});

		console.log(
			JSON.stringify({
				port: PORT,
				scroll: {
					beforeNote: before.noteScrollTop,
					afterHorizontalCodeLeft: afterHorizontal.codeScrollLeft,
					afterInsideNote: afterVerticalInside.noteScrollTop,
					afterOutsideNote: afterOutside.noteScrollTop,
					codeScrollTop: afterOutside.codeScrollTop,
				},
				blocks: afterOutside.shikiBlocks,
			}),
		);
	} finally {
		await normalizeDesktopViewport(client).catch(() => undefined);
		client.close();
	}
}

main().catch(error => {
	console.error('verify:obsidian-advanced-codeblock-interactions failed', error);
	process.exit(1);
});
