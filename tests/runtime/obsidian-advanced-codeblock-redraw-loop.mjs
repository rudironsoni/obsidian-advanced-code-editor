#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PORT = 9230;
const PORT = Number(process.env.OBSIDIAN_DEBUG_PORT ?? DEFAULT_PORT);
const REPORT_DIR = process.env.OBSIDIAN_LIVE_PREVIEW_REDRAW_REPORT_DIR ?? path.join('planning', 'test-reports', 'runtime', 'live-preview-redraw-loop');
const NOTE_PATH = 'codex-live-preview-redraw-loop.md';
const CODE_MARKER = 'redrawLoopMarker';

const SETTINGS_MATRIX = [
	{ wrap: false, lineNumbers: false },
	{ wrap: false, lineNumbers: true },
	{ wrap: true, lineNumbers: false },
	{ wrap: true, lineNumbers: true },
];

const VIEWPORTS = [
	{ name: 'desktop-1200x900', width: 1200, height: 900, mobile: false, deviceScaleFactor: 1 },
	{ name: 'mobile-390x844', width: 390, height: 844, mobile: true, deviceScaleFactor: 3 },
];

const MODE_SWITCH_ITERATIONS = 2;

function assert(condition, message, details = undefined) {
	if (!condition) {
		const suffix = details === undefined ? '' : `\n${JSON.stringify(details, null, 2)}`;
		throw new Error(`${message}${suffix}`);
	}
}

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

function isObsidianTarget(target) {
	if (!target?.webSocketDebuggerUrl || target.type !== 'page') {
		return false;
	}
	const title = `${target.title ?? ''}`;
	const url = `${target.url ?? ''}`;
	return /obsidian/i.test(title) || /app:\/\/obsidian\.md/i.test(url);
}

async function connectToExistingObsidian(port) {
	const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
	const page = targets.find(target => /app:\/\/obsidian\.md\/index\.html/i.test(target.url ?? '')) ?? targets.find(isObsidianTarget);
	assert(page, `No Obsidian page target is listening on CDP port ${port}`);
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
	let lastError;
	for (let attempt = 0; attempt < 6; attempt++) {
		try {
			const result = await withTimeout(
				client.send('Runtime.evaluate', {
					expression,
					awaitPromise: true,
					returnByValue: true,
				}),
				15_000,
				`Timed out evaluating ${expression.slice(0, 120)}`,
			);
			if (result.exceptionDetails) {
				throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails));
			}
			return result.result.value;
		} catch (error) {
			lastError = error;
			if (!isRetryableRuntimeReset(error)) {
				throw error;
			}
			await delay(250);
		}
	}
	throw lastError;
}

function isRetryableRuntimeReset(error) {
	const message = String(error?.message ?? error);
	return (
		message.includes('Execution context was destroyed') ||
		message.includes('Cannot find context with specified id') ||
		message.includes('Inspected target navigated or closed') ||
		message.includes('Cannot access a disposed object')
	);
}

async function withTimeout(promise, timeoutMs, message) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function waitFor(client, expression, message, timeoutMs = 20_000) {
	const deadline = Date.now() + timeoutMs;
	let lastValue;
	while (Date.now() < deadline) {
		lastValue = await evaluate(client, expression);
		if (lastValue) {
			return lastValue;
		}
		await delay(150);
	}
	throw new Error(`${message}\nLast value:\n${JSON.stringify(lastValue, null, 2)}`);
}

async function waitForPlugin(client) {
	return waitFor(
		client,
		`Boolean(globalThis.app?.workspace && globalThis.app?.vault && globalThis.app?.plugins?.plugins?.['advanced-code-block'])`,
		'Timed out waiting for advanced-code-block plugin',
	);
}

async function ensureObsidianVisible(client) {
	await evaluate(
		client,
		`(() => {
			const win = globalThis.electronWindow;
			win?.show?.();
			win?.restore?.();
			win?.setBounds?.({ x: 100, y: 100, width: 1200, height: 900 });
			win?.focus?.();
			return true;
		})()`,
	);
	await waitFor(client, `document.visibilityState === 'visible'`, 'Timed out waiting for visible Obsidian window', 10_000);
}

function fixtureContent() {
	const longTail = 'abcdefghijklmnopqrstuvwxyz0123456789_'.repeat(12);
	return [
		'# Live Preview redraw loop fixture',
		'',
		'Intro paragraph before the code block. '.repeat(10),
		'',
		'```ts',
		'const intervals = [[1, 3], [2, 6], [8, 10], [15, 18]];',
		'const merged: Array<[number, number]> = [];',
		`const ${CODE_MARKER} = "${longTail}";`,
		'for (const [start, end] of intervals) {',
		'  const previous = merged.at(-1);',
		'  if (!previous || previous[1] < start) {',
		'    merged.push([start, end]);',
		'  } else {',
		'    previous[1] = Math.max(previous[1], end);',
		'  }',
		'}',
		'console.log(merged);',
		'```',
		'',
		'After paragraph. '.repeat(160),
	].join('\n');
}

async function setupFixture(client) {
	return evaluate(
		client,
		`(async () => {
			if (!globalThis.app?.vault || !globalThis.app?.workspace) throw new Error('Obsidian app is not ready');
			const plugin = globalThis.app.plugins.plugins['advanced-code-block'];
			if (!plugin) throw new Error('advanced-code-block is not loaded');
			const content = ${JSON.stringify(fixtureContent())};
			let file = globalThis.app.vault.getAbstractFileByPath(${JSON.stringify(NOTE_PATH)});
			if (file) {
				await globalThis.app.vault.modify(file, content);
			} else {
				file = await globalThis.app.vault.create(${JSON.stringify(NOTE_PATH)}, content);
			}
			const originalSettings = structuredClone(plugin.settings);
			return { originalSettings, activeFile: file?.path ?? ${JSON.stringify(NOTE_PATH)} };
		})()`,
	);
}

async function restoreSettings(client, originalSettings) {
	await waitForPlugin(client);
	await evaluate(
		client,
		`(async () => {
			const plugin = globalThis.app.plugins.plugins['advanced-code-block'];
			if (!plugin) return false;
			plugin.settings = ${JSON.stringify(originalSettings)};
			plugin.loadedSettings = structuredClone(plugin.settings);
			await plugin.saveData(plugin.settings);
			return true;
		})()`,
	);
}

async function applySettings(client, settings) {
	await waitForPlugin(client);
	await evaluate(
		client,
		`(async () => {
			const plugin = globalThis.app.plugins.plugins['advanced-code-block'];
			if (!plugin) throw new Error('advanced-code-block is not loaded');
			plugin.settings.wrapLines = ${JSON.stringify(settings.wrap)};
			plugin.settings.showLineNumbers = ${JSON.stringify(settings.lineNumbers)};
			plugin.loadedSettings = structuredClone(plugin.settings);
			await plugin.saveData(plugin.settings);
			await plugin.updateCm6Plugin?.();
			return {
				wrap: plugin.loadedSettings.wrapLines,
				lineNumbers: plugin.loadedSettings.showLineNumbers,
			};
		})()`,
	);
	await waitForSettings(client, settings);
}

async function waitForSettings(client, settings) {
	return waitFor(
		client,
		`(() => {
			const plugin = globalThis.app?.plugins?.plugins?.['advanced-code-block'];
			return !!plugin && plugin.loadedSettings?.wrapLines === ${JSON.stringify(settings.wrap)} && plugin.loadedSettings?.showLineNumbers === ${JSON.stringify(settings.lineNumbers)};
		})()`,
		`Timed out waiting for settings wrap:${settings.wrap} lines:${settings.lineNumbers}`,
	);
}

async function setViewport(client, viewport) {
	if (viewport.mobile) {
		await client.send('Emulation.setDeviceMetricsOverride', {
			width: viewport.width,
			height: viewport.height,
			deviceScaleFactor: viewport.deviceScaleFactor,
			mobile: true,
		});
	} else {
		await client.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
		await evaluate(
			client,
			`(() => {
				const win = globalThis.electronWindow;
				win?.show?.();
				win?.restore?.();
				win?.setBounds?.({ x: 100, y: 100, width: ${JSON.stringify(viewport.width)}, height: ${JSON.stringify(viewport.height)} });
				win?.focus?.();
				return true;
			})()`,
		);
	}
	await waitFor(client, 'Boolean(globalThis.app?.workspace && globalThis.app?.vault)', 'Timed out waiting for Obsidian app global');
	await evaluate(client, `globalThis.app?.emulateMobile?.(${JSON.stringify(viewport.mobile)}); true`);
	await waitFor(
		client,
		`Boolean(globalThis.app?.workspace && globalThis.app?.vault) && globalThis.app?.isMobile === ${JSON.stringify(viewport.mobile)}`,
		`Timed out waiting for ${viewport.name}`,
	);
	await waitForPlugin(client);
	await delay(viewport.mobile ? 1_000 : 300);
}

async function openMode(client, mode) {
	const state = mode === 'reading' ? { file: NOTE_PATH, mode: 'preview' } : { file: NOTE_PATH, mode: 'source', source: mode === 'source' };
	await evaluate(
		client,
		`(() => {
			let file = globalThis.app.vault.getAbstractFileByPath(${JSON.stringify(NOTE_PATH)});
			if (!file) throw new Error('Fixture note is missing');
			// In fresh sessions there may be no ready tab group yet.
			const isUsableLeaf = leaf => !!leaf && typeof leaf.setViewState === 'function' && typeof leaf.openFile === 'function';
			const safeGetLeaf = getter => {
				try {
					return getter();
				} catch {
					return null;
				}
			};
			let leaf = globalThis.app.workspace.activeLeaf;
			if (!isUsableLeaf(leaf) || leaf.view?.getViewType?.() === 'empty') {
				leaf = null;
			}
			if (!isUsableLeaf(leaf)) {
				leaf = globalThis.app.workspace.getLeavesOfType?.('markdown')?.find(isUsableLeaf) ?? null;
			}
			if (!isUsableLeaf(leaf)) {
				leaf = safeGetLeaf(() => globalThis.app.workspace.getLeaf('tab'));
			}
			if (!isUsableLeaf(leaf)) {
				leaf = safeGetLeaf(() => globalThis.app.workspace.getLeaf(false));
			}
			if (!isUsableLeaf(leaf)) {
				leaf = safeGetLeaf(() => globalThis.app.workspace.getLeaf(true));
			}
			if (!isUsableLeaf(leaf)) {
				leaf = safeGetLeaf(() => globalThis.app.workspace.getLeaf('tab')) ?? safeGetLeaf(() => globalThis.app.workspace.activeLeaf);
			}
			if (!isUsableLeaf(leaf)) {
				leaf = safeGetLeaf(() => globalThis.app.workspace.getLeaf()) ?? safeGetLeaf(() => globalThis.app.workspace.getLeaf('split')) ?? safeGetLeaf(() => globalThis.app.workspace.getLeaf(false));
			}
			if (!leaf || !leaf.setViewState || !leaf.openFile) {
				globalThis.location.reload();
				throw new Error('Execution context was destroyed');
			}
			void Promise.resolve(leaf.setViewState({ type: 'markdown', state: ${JSON.stringify(state)}, active: true }, { history: false })).catch(() => undefined);
			globalThis.app.workspace.setActiveLeaf?.(leaf, { focus: true });
			for (const element of document.querySelectorAll('.view-content, .cm-scroller, .cm-editor, .markdown-preview-view')) {
				element.scrollTop = 0;
				element.scrollLeft = 0;
			}
			return true;
		})()`,
	);
	await waitForMode(client, mode);
	await evaluate(
		client,
		`(() => {
		void Promise.resolve(globalThis.app?.plugins?.plugins?.['advanced-code-block']?.updateCm6Plugin?.()).catch(() => undefined);
		return true;
	})()`,
	);
	await delay(300);
}

async function waitForMode(client, mode) {
	const expectedFile = JSON.stringify(NOTE_PATH);
	const modeExpression =
		mode === 'reading'
			? `Boolean(document.querySelector('.workspace-leaf.mod-active .markdown-preview-view'))`
			: mode === 'live-preview'
				? `Boolean(document.querySelector('.workspace-leaf.mod-active .markdown-source-view.mod-cm6.is-live-preview'))`
				: `Boolean(document.querySelector('.workspace-leaf.mod-active .markdown-source-view.mod-cm6:not(.is-live-preview)'))`;
	return waitFor(
		client,
		`globalThis.app?.workspace?.getActiveFile?.()?.path === ${expectedFile} && ${modeExpression}`,
		`Timed out waiting for ${mode} mode`,
		20_000,
	);
}

async function collectState(client) {
	return evaluate(
		client,
		`(() => {
			window.__shikiRedrawVerifierHostIds ??= new WeakMap();
			window.__shikiRedrawVerifierNextHostId ??= 1;
			const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
			const plugin = globalThis.app?.plugins?.plugins?.['advanced-code-block'];
			const settings = plugin ? { showLineNumbers: plugin.loadedSettings?.showLineNumbers, wrapLines: plugin.loadedSettings?.wrapLines } : null;
			const headers = [...root.querySelectorAll('.shiki-live-preview-header')];
			const header = headers[0] ?? null;
			const codeLines = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line')];
			const fenceLines = [...root.querySelectorAll('.cm-line.shiki-live-preview-fence-line')];
			const fenceWidgets = [...root.querySelectorAll('.cm-line.shiki-live-preview-fence-line .shiki-live-preview-fence-text')];
				const tokenSpans = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line [style*="color:"]')];
				const codeContent = [...root.querySelectorAll('.shiki-live-preview-code-content')];
				const codeContentTranslateXValues = codeContent.map(element => {
					const transform = getComputedStyle(element).transform;
					if (!transform || transform === 'none') return 0;
					return new DOMMatrixReadOnly(transform).m41;
				});
				const codeContentTranslateXSpread = codeContentTranslateXValues.length
					? Math.max(...codeContentTranslateXValues) - Math.min(...codeContentTranslateXValues)
					: 0;
				const lineNumbers = [...root.querySelectorAll('.shiki-live-preview-line-number')];
				const visibleGutters = [...root.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].filter(element => getComputedStyle(element).visibility !== 'hidden');
				const isVisibleElement = element => {
					const rect = element.getBoundingClientRect();
					const style = getComputedStyle(element);
					return rect.width > 0 && rect.height > 0 && !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
				};
				const scrollbars = [...root.querySelectorAll('.shiki-block-horizontal-scrollbar')].filter(isVisibleElement);
				const scrollOwners = [...root.querySelectorAll('[data-shiki-scroll-owner="true"]')].filter(isVisibleElement);
				const host = header;
			if (host && !window.__shikiRedrawVerifierHostIds.has(host)) {
				window.__shikiRedrawVerifierHostIds.set(host, window.__shikiRedrawVerifierNextHostId++);
			}
			const blockRect = header?.getBoundingClientRect?.() ?? null;
			const visibleCodeRows = codeLines.filter(row => {
				const rect = row.getBoundingClientRect();
				const style = getComputedStyle(row);
				return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
			});
			const cmScroller = root.querySelector('.cm-scroller');
			const codeOverflow = codeLines.some(row => row.scrollWidth > row.clientWidth + 1);
			const noteScrollers = [...root.querySelectorAll('.view-content, .cm-editor, .markdown-source-view')].map(element => ({
				className: element.className,
				scrollLeft: element.scrollLeft,
				scrollTop: element.scrollTop,
			}));
			const verticalScrollers = cmScroller ? [...noteScrollers, { className: cmScroller.className, scrollLeft: cmScroller.scrollLeft, scrollTop: cmScroller.scrollTop }] : noteScrollers;
			return {
				activeFile: globalThis.app?.workspace?.getActiveFile?.()?.path ?? null,
				isMobile: globalThis.app?.isMobile ?? false,
				blocks: headers.length,
				blockId: host ? window.__shikiRedrawVerifierHostIds.get(host) : null,
				blockRect: blockRect ? {
					left: blockRect.left,
					top: blockRect.top,
					width: blockRect.width,
					height: blockRect.height,
					bottom: blockRect.bottom,
				} : null,
				tokenSpans: tokenSpans.length,
				hasLineNumbers: lineNumbers.length > 0,
				hasHeader: headers.length > 0,
				fenceLines: fenceLines.length,
					fenceWidgets: fenceWidgets.map(widget => ({ text: widget.textContent, color: getComputedStyle(widget).color })),
					hasScrollContainer: codeOverflow,
					visibleRawRows: visibleCodeRows.length,
					visibleGutters: visibleGutters.length,
					blockScrollLeft: Math.max(0, ...scrollbars.map(scrollbar => scrollbar.scrollLeft ?? 0), ...codeLines.map(row => row.scrollLeft ?? 0)),
					rowScrollLeftMax: Math.max(0, ...codeLines.map(row => row.scrollLeft ?? 0)),
					scrollOwnerCount: scrollOwners.length,
					codeContentCount: codeContent.length,
					codeContentTranslateXValues,
					codeContentTranslateXSpread,
					cmScrollerScrollLeft: cmScroller?.scrollLeft ?? 0,
				settings,
				noteScrollLeft: Math.max(0, ...noteScrollers.map(scroller => scroller.scrollLeft ?? 0)),
				noteScrollTop: Math.max(0, ...verticalScrollers.map(scroller => scroller.scrollTop ?? 0)),
				bodyClass: document.body.className,
			};
		})()`,
	);
}

function assertShikiReady(state, context) {
	assert(state.activeFile === NOTE_PATH, `${context}: fixture note is not active`, state);
	assert(state.blocks === 1, `${context}: expected exactly one Shiki live preview surface`, state);
	assert(state.blockRect?.width > 20 && state.blockRect?.height > 20, `${context}: Shiki block has invalid geometry`, state);
	assert(state.tokenSpans > 0, `${context}: Shiki block rendered no token spans`, state);
	assert(state.visibleRawRows > 0, `${context}: native CodeMirror code rows are not visible`, state);
	assert(state.fenceLines === 2, `${context}: expected native opening and closing fence rows`, state);
	assert(state.fenceWidgets?.length === 2, `${context}: expected raw opening and closing fence widgets`, state);
	assert(state.fenceWidgets[0]?.text === '```ts' && state.fenceWidgets[1]?.text === '```', `${context}: raw fence text is incorrect`, state);
	if (state.settings?.showLineNumbers === true) {
		assert(state.hasLineNumbers, `${context}: Shiki block missing line numbers`, state);
	} else if (state.settings?.showLineNumbers === false) {
		assert(!state.hasLineNumbers, `${context}: Shiki block unexpectedly rendered line numbers`, state);
	}
	assert(state.hasHeader, `${context}: Shiki Live Preview missing header`, state);
	assert(state.settings?.wrapLines === true || state.hasScrollContainer, `${context}: nowrap code rows do not expose horizontal overflow`, state);
	assert(state.visibleGutters > 0, `${context}: native CodeMirror line gutters are not visible`, state);
	assert(state.noteScrollLeft === 0, `${context}: note scroller moved horizontally`, state);
}

async function waitForShikiReady(client, context) {
	const deadline = Date.now() + 12_000;
	let lastState;
	while (Date.now() < deadline) {
		lastState = await collectState(client);
		try {
			assertShikiReady(lastState, context);
			return lastState;
		} catch {
			await delay(150);
		}
	}
	assertShikiReady(lastState, context);
	return lastState;
}

async function measureStyleChurnDuringRefresh(client) {
	return evaluate(
		client,
		`(async () => {
			const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
			const targets = [
				...root.querySelectorAll('.shiki-live-preview-header, .cm-line.shiki-live-preview-code-line, .shiki-live-preview-code-content, .shiki-block-horizontal-scrollbar'),
			];
			let styleMutations = 0;
			const observer = new MutationObserver(records => {
				for (const record of records) {
					if (record.type === 'attributes' && record.attributeName === 'style') {
						styleMutations++;
					}
				}
			});
			for (const target of targets) {
				observer.observe(target, { attributes: true, attributeFilter: ['style'] });
			}
			for (let attempt = 0; attempt < 5; attempt++) {
				void Promise.resolve(globalThis.app?.plugins?.plugins?.['advanced-code-block']?.updateCm6Plugin?.()).catch(() => undefined);
				await new Promise(resolve => setTimeout(resolve, 120));
			}
			await new Promise(resolve => setTimeout(resolve, 250));
			observer.disconnect();
			return { styleMutations, targets: targets.length };
		})()`,
	);
}

async function assertStable(client, context) {
	const samples = [];
	for (let i = 0; i < 12; i++) {
		samples.push(await collectState(client));
		await delay(100);
	}
	for (const sample of samples) {
		assertShikiReady(sample, context);
	}
	const blockIds = new Set(samples.map(sample => sample.blockId));
	assert(blockIds.size === 1, `${context}: Shiki block was recreated during stability sampling`, samples);
	const heights = samples.map(sample => sample.blockRect.height);
	const tops = samples.map(sample => sample.blockRect.top);
	assert(Math.max(...heights) - Math.min(...heights) <= 2, `${context}: Shiki block height is jittering`, samples);
	assert(Math.max(...tops) - Math.min(...tops) <= 2, `${context}: Shiki block top is jittering`, samples);
	const styleChurn = await measureStyleChurnDuringRefresh(client);
	assert(styleChurn.styleMutations <= 4, `${context}: Shiki block styles churned during idle refresh sampling`, { styleChurn, samples });
	return samples.at(-1);
}

async function verifyScroll(client, settings, context) {
	await waitForSettings(client, settings);
	const before = await waitForShikiReady(client, `${context} before scroll`);
	await evaluate(
		client,
		`(() => {
		void Promise.resolve(globalThis.app?.plugins?.plugins?.['advanced-code-block']?.updateCm6Plugin?.()).catch(() => undefined);
		return true;
	})()`,
	);
	await delay(300);
	const wheelTarget = await evaluate(
		client,
		`(() => {
			const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
				for (const element of root.querySelectorAll('.view-content, .cm-scroller, .cm-editor, .markdown-source-view, .cm-line.shiki-live-preview-code-line, .shiki-block-horizontal-scrollbar')) {
					element.scrollLeft = 0;
				}
			if (${JSON.stringify(!settings.wrap)}) {
				const codeLines = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line')];
				const item = codeLines
					.map(row => ({ row, overflow: row.scrollWidth - row.clientWidth }))
					.sort((first, second) => second.overflow - first.overflow)[0];
				const codeLine = item?.row;
				if (codeLine && item.overflow > 0) {
					const rect = codeLine.getBoundingClientRect();
					const clientX = rect.left + Math.min(120, Math.max(8, rect.width / 2));
					const clientY = rect.top + Math.min(10, Math.max(2, rect.height / 2));
					return { clientX, clientY, overflow: item.overflow };
				}
			}
			return null;
		})()`,
	);
	if (wheelTarget) {
		if (before.isMobile) {
			await evaluate(
				client,
				`(() => {
						const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
						const codeLines = [...root.querySelectorAll('.cm-line.shiki-live-preview-code-line')];
						const item = codeLines
							.map(row => ({ row, overflow: row.scrollWidth - row.clientWidth }))
							.sort((first, second) => second.overflow - first.overflow)[0];
						const target = [...root.querySelectorAll('.shiki-block-horizontal-scrollbar')]
							.find(scrollbar => {
								const rect = scrollbar.getBoundingClientRect();
								const style = getComputedStyle(scrollbar);
								return rect.width > 0 && rect.height > 0 && !scrollbar.hidden && style.display !== 'none' && style.visibility !== 'hidden';
							}) ?? item?.row;
						if (!target || item.overflow <= 0) return false;
						const rect = target.getBoundingClientRect();
						const clientY = rect.top + Math.min(10, Math.max(2, rect.height / 2));
						const startX = rect.left + Math.min(220, target.clientWidth - 8);
						const endX = rect.left + 24;
						const pointerId = 77;
						target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: startX, clientY }));
						target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: endX, clientY }));
						target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', clientX: endX, clientY }));
						return true;
					})()`,
			);
		} else {
			await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wheelTarget.clientX, y: wheelTarget.clientY, button: 'none' });
			await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wheelTarget.clientX, y: wheelTarget.clientY, deltaX: 260, deltaY: 0 });
		}
	}
	await evaluate(
		client,
		`(() => {
				const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
				const scrollbar = [...root.querySelectorAll('.shiki-block-horizontal-scrollbar')].find(candidate => {
					const rect = candidate.getBoundingClientRect();
					const style = getComputedStyle(candidate);
					return rect.width > 0 && rect.height > 0 && !candidate.hidden && style.display !== 'none' && style.visibility !== 'hidden';
				});
				if (!scrollbar) return false;
				scrollbar.scrollLeft = Math.min(260, Math.max(1, scrollbar.scrollWidth - scrollbar.clientWidth));
				scrollbar.dispatchEvent(new Event('scroll'));
				return scrollbar.scrollLeft > 0;
			})()`,
	);
	await evaluate(
		client,
		`(async () => {
				const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
				const scrollbar = [...root.querySelectorAll('.shiki-block-horizontal-scrollbar')].find(candidate => {
					const rect = candidate.getBoundingClientRect();
					const style = getComputedStyle(candidate);
					return rect.width > 0 && rect.height > 0 && !candidate.hidden && style.display !== 'none' && style.visibility !== 'hidden';
				});
				if (!scrollbar) return false;
				for (let attempt = 0; attempt < 10; attempt++) {
					scrollbar.scrollLeft = Math.min(260, Math.max(1, scrollbar.scrollWidth - scrollbar.clientWidth));
					scrollbar.dispatchEvent(new Event('scroll'));
					await new Promise(resolve => setTimeout(resolve, 50));
					const content = root.querySelector('.shiki-live-preview-code-content');
					if (content && new DOMMatrixReadOnly(getComputedStyle(content).transform).m41 < 0) {
						return true;
					}
				}
				return false;
			})()`,
	);
	await delay(300);
	await evaluate(
		client,
		`(() => {
				const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
				const scrollbar = [...root.querySelectorAll('.shiki-block-horizontal-scrollbar')].find(candidate => {
					const rect = candidate.getBoundingClientRect();
					const style = getComputedStyle(candidate);
					return rect.width > 0 && rect.height > 0 && !candidate.hidden && style.display !== 'none' && style.visibility !== 'hidden';
				});
				if (!scrollbar) return false;
				scrollbar.scrollLeft = Math.min(260, Math.max(1, scrollbar.scrollWidth - scrollbar.clientWidth));
				scrollbar.dispatchEvent(new Event('scroll'));
				return scrollbar.scrollLeft > 0;
			})()`,
	);
	const afterHorizontal = await collectState(client);
	assertShikiReady(afterHorizontal, `${context} after horizontal scroll`);
	assert(afterHorizontal.noteScrollLeft === 0, `${context}: note moved horizontally during code scroll`, { before, after: afterHorizontal, settings });
	if (!settings.wrap) {
		assert(afterHorizontal.hasScrollContainer, `${context}: nowrap code rows do not expose horizontal overflow`, {
			before,
			after: afterHorizontal,
			settings,
		});
		assert(afterHorizontal.cmScrollerScrollLeft === 0, `${context}: native CodeMirror scroller moved horizontally`, {
			before,
			after: afterHorizontal,
			settings,
		});
		assert(afterHorizontal.blockScrollLeft > 0, `${context}: block scrollbar did not move horizontally`, { before, after: afterHorizontal, settings });
		assert(afterHorizontal.scrollOwnerCount === 1, `${context}: Live Preview should have exactly one block scroll owner`, {
			before,
			after: afterHorizontal,
			settings,
		});
		assert(afterHorizontal.rowScrollLeftMax === 0, `${context}: Live Preview rows should not own horizontal scrollLeft`, {
			before,
			after: afterHorizontal,
			settings,
		});
		assert(afterHorizontal.codeContentCount > 0, `${context}: Live Preview code content was not measurable`, {
			before,
			after: afterHorizontal,
			settings,
		});
		assert(afterHorizontal.codeContentTranslateXSpread <= 0.5, `${context}: Live Preview code rows do not share one horizontal offset`, {
			before,
			after: afterHorizontal,
			settings,
		});
		assert(
			afterHorizontal.codeContentTranslateXValues.every(value => Math.abs(value + afterHorizontal.blockScrollLeft) <= 1),
			`${context}: Live Preview code content is not translated by the block scrollLeft`,
			{ before, after: afterHorizontal, settings },
		);
	}
	await evaluate(
		client,
		`(() => {
			const root = document.querySelector('.workspace-leaf.mod-active') ?? document;
			const scroller = [...root.querySelectorAll('.cm-scroller, .view-content, .markdown-source-view')]
				.find(candidate => candidate.scrollHeight > candidate.clientHeight + 20);
			if (scroller) scroller.scrollTop = Math.min(scroller.scrollTop + 260, scroller.scrollHeight - scroller.clientHeight);
			for (const element of root.querySelectorAll('.view-content, .cm-scroller, .cm-editor, .markdown-source-view')) element.scrollLeft = 0;
			return true;
		})()`,
	);
	await delay(300);
	const afterVertical = await collectState(client);
	assertShikiReady(afterVertical, `${context} after vertical scroll`);
	assert(afterVertical.noteScrollTop > 0 || before.noteScrollTop > 0, `${context}: note did not move vertically during vertical scroll`, {
		before,
		after: afterVertical,
	});
}

async function captureScreenshot(client, filename) {
	const result = await withTimeout(
		client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
		10_000,
		`Timed out capturing screenshot ${filename}`,
	);
	const target = path.join(REPORT_DIR, filename);
	await writeFile(target, Buffer.from(result.data, 'base64'));
	return target;
}

async function run() {
	await mkdir(REPORT_DIR, { recursive: true });
	const client = await connectToExistingObsidian(PORT);
	const checks = [];
	const screenshots = [];
	let originalSettings;
	try {
		await waitForPlugin(client);
		await ensureObsidianVisible(client);
		const setup = await setupFixture(client);
		originalSettings = setup.originalSettings;
		for (const viewport of VIEWPORTS) {
			await setViewport(client, viewport);
			for (const settings of SETTINGS_MATRIX) {
				await applySettings(client, settings);
				for (let iteration = 0; iteration < MODE_SWITCH_ITERATIONS; iteration++) {
					const prefix = `${viewport.name} wrap:${settings.wrap ? 'on' : 'off'} lines:${settings.lineNumbers ? 'on' : 'off'} iteration:${iteration + 1}`;
					await openMode(client, 'source');
					await openMode(client, 'live-preview');
					const sourceState = await waitForShikiReady(client, `${prefix} source-to-live-preview`);
					await assertStable(client, `${prefix} source-to-live-preview stable`);
					await openMode(client, 'reading');
					await openMode(client, 'live-preview');
					const readingState = await waitForShikiReady(client, `${prefix} reading-to-live-preview`);
					const stableState = await assertStable(client, `${prefix} reading-to-live-preview stable`);
					checks.push({ viewport: viewport.name, settings, iteration: iteration + 1, sourceState, readingState, stableState });
				}
				await verifyScroll(client, settings, `${viewport.name} wrap:${settings.wrap ? 'on' : 'off'} lines:${settings.lineNumbers ? 'on' : 'off'}`);
				screenshots.push(
					await captureScreenshot(client, `${viewport.name}-wrap-${settings.wrap ? 'on' : 'off'}-lines-${settings.lineNumbers ? 'on' : 'off'}.png`),
				);
			}
		}
		await writeFile(path.join(REPORT_DIR, 'report.json'), JSON.stringify({ checks, screenshots }, null, 2));
		console.log(JSON.stringify({ reportDir: REPORT_DIR, checks: checks.length, screenshots }, null, 2));
	} finally {
		if (originalSettings) {
			await restoreSettings(client, originalSettings).catch(error => console.error(`Failed to restore plugin settings: ${error.message}`));
		}
		await evaluate(client, 'globalThis.app?.emulateMobile?.(false); true').catch(() => undefined);
		await client.send('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
		client.close();
	}
}

run().catch(error => {
	console.error(`verify:obsidian-advanced-codeblock-redraw-loop failed: ${error?.message ?? error}`);
	process.exitCode = 1;
});
