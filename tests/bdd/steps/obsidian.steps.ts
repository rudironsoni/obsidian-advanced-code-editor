import { Given, Then, When } from '@wdio/cucumber-framework';
import { browser } from '@wdio/globals';
import { strict as assert } from 'node:assert';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
	horizontalScrollPage,
	type ExactEditResult,
	type HorizontalScrollGesture,
	type HorizontalScrollLineNumberLayoutComparison,
	type HorizontalScrollMode,
	type HorizontalScrollPerformanceResult,
	type HorizontalScrollState,
} from '../pages/HorizontalScroll.page.js';
import { obsidianApp } from '../pages/ObsidianApp.page.js';
import { artifactDir, writeJsonArtifact } from '../support/artifacts.js';

let lastExpectedRenderText = '';
let activeHorizontalScrollMode: HorizontalScrollMode = 'reading';
let activeHorizontalScrollNotePath = '';
let lastHorizontalScrollState: HorizontalScrollState | undefined;
let lastExactEdit: ExactEditResult | undefined;
let lastHorizontalScrollPerformance: HorizontalScrollPerformanceResult | undefined;
let lastHorizontalScrollLineNumberLayout: HorizontalScrollLineNumberLayoutComparison | undefined;

Given('the built Shiki plugin is enabled in the fixture vault', async () => {
	await obsidianApp.waitForPluginLoaded();
});

Given('the fixture note {string} is open in reading mode', async (notePath: string) => {
	await obsidianApp.openFixtureInReadingMode(notePath);
});

Given('Obsidian is running in mobile emulation', async () => {
	await obsidianApp.expectMobileEmulation();
});

When('Obsidian renders the active note', async () => {
	if (!lastExpectedRenderText) {
		lastExpectedRenderText = 'const wdioValue';
	}
	await obsidianApp.waitForReadingRender(lastExpectedRenderText);
});

Then('the Shiki plugin should be loaded from the built payload', async () => {
	const state = await obsidianApp.waitForPluginLoaded();

	assert.equal(state.loaded, true);
	assert.match(state.version ?? '', /^\d+\.\d+\.\d+/);
});

Then('a visible Shiki code block should render {string}', async (expectedText: string) => {
	lastExpectedRenderText = expectedText;
	const state = await obsidianApp.waitForReadingRender(expectedText);

	assert.equal(state.blocks, 1);
	assert.ok(state.tokens > 0, 'expected syntax-highlighted token spans');
	assert.ok(state.text.includes(expectedText), 'expected fixture code text');
	assert.ok(state.width > 80, 'expected visible block width');
	assert.ok(state.height > 20, 'expected visible block height');
});

Given('the horizontal scroll fixture notes are reset', async () => {
	await horizontalScrollPage.resetFixtureNotes();
});

Given('horizontal scroll settings use nowrap with line numbers', async () => {
	await horizontalScrollPage.applySettings({ wrapLines: false, showLineNumbers: true });
});

Given('horizontal scroll settings use wrapping with line numbers', async () => {
	await horizontalScrollPage.applySettings({ wrapLines: true, showLineNumbers: true });
});

Given('the fixture note {string} is open in reading mode for horizontal scroll', async (notePath: string) => {
	activeHorizontalScrollMode = 'reading';
	activeHorizontalScrollNotePath = notePath;
	await horizontalScrollPage.openFixture(notePath, activeHorizontalScrollMode);
	lastHorizontalScrollState = await horizontalScrollPage.waitForHorizontalScrollReady(activeHorizontalScrollMode, 1, true);
});

Given('the fixture note {string} is open in Live Preview for horizontal scroll', async (notePath: string) => {
	activeHorizontalScrollMode = 'live-preview';
	activeHorizontalScrollNotePath = notePath;
	await horizontalScrollPage.openFixture(notePath, activeHorizontalScrollMode);
	lastHorizontalScrollState = await horizontalScrollPage.waitForHorizontalScrollReady(
		activeHorizontalScrollMode,
		notePath.includes('multi') ? 2 : 1,
		!notePath.includes('wrapped'),
	);
});

Given('the fixture note {string} is open in raw Source mode for horizontal scroll', async (notePath: string) => {
	activeHorizontalScrollMode = 'source';
	activeHorizontalScrollNotePath = notePath;
	await horizontalScrollPage.openFixture(notePath, activeHorizontalScrollMode);
	lastHorizontalScrollState = await horizontalScrollPage.waitForHorizontalScrollReady(activeHorizontalScrollMode, 1, true);
});

When('I scroll the first code block horizontally with its block scrollbar', async () => {
	lastHorizontalScrollState = await performHorizontalScroll('scrollbar');
});

When('I scroll the first code block horizontally with a wheel gesture', async () => {
	lastHorizontalScrollState = await performHorizontalScroll('wheel');
});

When('I scroll the first code block horizontally with a Shift-wheel gesture', async () => {
	lastHorizontalScrollState = await performHorizontalScroll('shift-wheel');
});

When('I scroll the first code block horizontally with a touch gesture', async () => {
	lastHorizontalScrollState = await performHorizontalScroll('touch');
});

When('I edit the visible horizontal scroll marker', async () => {
	lastExactEdit = await horizontalScrollPage.editMarkerAfterScroll();
	lastHorizontalScrollState = await horizontalScrollPage.collectScrollState(activeHorizontalScrollMode, 'after-exact-edit');
	writeJsonArtifact('horizontal-scroll-exact-edit', { edit: lastExactEdit, scroll: lastHorizontalScrollState });
});

When('I repeatedly scroll the first code block horizontally with wheel gestures', async () => {
	await horizontalScrollPage.resetScrollPositions(activeHorizontalScrollMode);
	lastHorizontalScrollPerformance = await horizontalScrollPage.measureRepeatedWheelScroll(activeHorizontalScrollMode, 0);
	lastHorizontalScrollState = lastHorizontalScrollPerformance.state;
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-wheel-performance`, lastHorizontalScrollPerformance);
});

When('I compare the first code block line-number layout with Reading mode', async () => {
	assert.ok(activeHorizontalScrollNotePath, 'expected an active horizontal scroll fixture note');
	assert.equal(activeHorizontalScrollMode, 'live-preview', 'expected comparison to start from Live Preview');
	lastHorizontalScrollLineNumberLayout = await horizontalScrollPage.compareLineNumberLayoutWithReading(activeHorizontalScrollNotePath);
	activeHorizontalScrollMode = 'live-preview';
	writeJsonArtifact('horizontal-scroll-line-number-layout', lastHorizontalScrollLineNumberLayout);
	mkdirSync(artifactDir, { recursive: true });
	const screenshotMode = lastHorizontalScrollLineNumberLayout.livePreview.isMobile ? 'mobile' : 'desktop';
	await browser.saveScreenshot(path.join(artifactDir, `horizontal-scroll-line-number-layout-live-preview-${screenshotMode}.png`));
});

Then('the active note should keep horizontal scroll inside the first code block', async () => {
	const state = await currentHorizontalScrollState('assert-block-scroll');
	const first = state.blocks[0];
	assert.ok(first, 'expected a first code block');
	assert.ok(first.visibleScrollbarCount >= 1 || first.scrollLeft > 0, `expected visible scrollbar or scrolled block: ${JSON.stringify(state)}`);
	assert.ok(first.scrollLeft > 0, `expected first block to scroll horizontally: ${JSON.stringify(state)}`);
	if (state.mode === 'live-preview') {
		if (first.scrollbarCount > 0) {
			assert.equal(first.scrollOwnerCount, 1, `expected mounted Live Preview scrollbar to own block scroll: ${JSON.stringify(state)}`);
		}
		assert.equal(first.rowScrollLeftMax, 0, `expected Live Preview rows not to own horizontal scrollLeft: ${JSON.stringify(state)}`);
		assert.ok(first.livePreviewContentCount > 0, `expected Live Preview code content marks to be measurable: ${JSON.stringify(state)}`);
		assert.ok(first.livePreviewContentTranslateXSpread <= 0.5, `expected Live Preview rows to share one horizontal offset: ${JSON.stringify(state)}`);
		for (const translateX of first.livePreviewContentTranslateXValues) {
			assert.ok(
				Math.abs(translateX + first.scrollLeft) <= 1,
				`expected Live Preview code content to be translated by the block scrollLeft: ${JSON.stringify(state)}`,
			);
		}
	}
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(state)}`);
});

Then('Live Preview horizontal scrolling should stay responsive', async () => {
	assert.ok(lastHorizontalScrollPerformance, 'expected Live Preview horizontal scroll performance result');
	const { metrics, state } = lastHorizontalScrollPerformance;
	const first = state.blocks[0];
	assert.ok(first, `expected a first code block after performance scroll: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(state.mode, 'live-preview', `expected Live Preview mode: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.eventCount >= 55, `expected at least 55 measured wheel events: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.p95DispatchMs <= 12, `expected p95 wheel dispatch under 12ms: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.maxDispatchMs <= 30, `expected max wheel dispatch under 30ms: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.maxFrameGapMs <= 80, `expected no severe frame gap above 80ms: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(first.scrollLeft > 0, `expected first block to scroll horizontally: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(first.rowScrollLeftMax, 0, `expected Live Preview rows not to own horizontal scrollLeft: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(first.livePreviewContentTranslateXSpread <= 0.5, `expected Live Preview rows to share one horizontal offset: ${JSON.stringify(state)}`);
});

Then('the Live Preview code block line-number gutter should match Reading mode', async () => {
	assert.ok(lastHorizontalScrollLineNumberLayout, 'expected line-number layout comparison result');
	const { livePreview, reading } = lastHorizontalScrollLineNumberLayout;
	const livePreviewBlock = livePreview.blocks[0];
	const readingBlock = reading.blocks[0];
	assert.ok(livePreviewBlock, `expected Live Preview block: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`);
	assert.ok(readingBlock, `expected Reading mode block: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`);
	assert.equal(livePreview.mode, 'live-preview', `expected Live Preview state: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`);
	assert.equal(reading.mode, 'reading', `expected Reading state: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`);
	assert.deepEqual(
		livePreviewBlock.lineNumberValues,
		readingBlock.lineNumberValues,
		`expected Live Preview block line numbers to match Reading mode: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
	assert.equal(
		livePreviewBlock.nativeBlockGutterCount,
		0,
		`expected native editor gutter hidden over the Live Preview code block: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
	assert.ok(
		livePreviewBlock.gutterToCodeGap !== null && readingBlock.gutterToCodeGap !== null,
		`expected measurable code gutter gaps: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
	assert.ok(
		Math.abs(livePreviewBlock.gutterToCodeGap - readingBlock.gutterToCodeGap) <= 2,
		`expected Live Preview gutter/code gap to match Reading mode: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
});

Then('the surrounding note should not move horizontally', async () => {
	const state = await currentHorizontalScrollState('assert-note-stable');
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(state)}`);
});

Then('raw Source mode should keep Markdown fences editable', async () => {
	const state = await currentHorizontalScrollState('assert-raw-source');
	assert.equal(activeHorizontalScrollMode, 'source');
	assert.equal(state.rawFenceVisible, true, `expected raw Markdown fences to remain visible: ${JSON.stringify(state)}`);
	assert.equal(state.monacoEditorCount, 0, `expected Source mode not to mount Monaco: ${JSON.stringify(state)}`);
});

Then('the exact edit should be written at the horizontal scroll marker', async () => {
	assert.ok(lastExactEdit, 'expected exact edit result');
	assert.equal(lastExactEdit.fileContainsEdit, true, `expected edit immediately after marker: ${JSON.stringify(lastExactEdit)}`);
	assert.ok(
		lastExactEdit.lineText.includes(`${horizontalScrollPage.marker}${horizontalScrollPage.editText}`),
		`expected edited line to contain marker edit: ${JSON.stringify(lastExactEdit)}`,
	);
	const state = await currentHorizontalScrollState('assert-exact-edit-scroll');
	assert.ok(state.blocks[0]?.scrollLeft > 0, `expected scroll to survive exact edit: ${JSON.stringify(state)}`);
});

Then('the first and second code blocks should keep independent horizontal scroll positions', async () => {
	const state = await currentHorizontalScrollState('assert-independent-blocks');
	assert.ok(state.blocks.length >= 2, `expected at least two code blocks: ${JSON.stringify(state)}`);
	assert.ok(state.blocks[0].scrollLeft > 0, `expected first block to be scrolled: ${JSON.stringify(state)}`);
	assert.equal(state.blocks[1].scrollLeft, 0, `expected second block to remain at scrollLeft 0: ${JSON.stringify(state)}`);
});

Then('wrapped code blocks should not require horizontal block scroll', async () => {
	const state = await currentHorizontalScrollState('assert-wrapped');
	assert.equal(state.wrapLines, true, `expected wrapLines setting to be enabled: ${JSON.stringify(state)}`);
	assert.ok(state.blocks.length >= 1, `expected a wrapped code block: ${JSON.stringify(state)}`);
	for (const block of state.blocks) {
		assert.ok(
			block.disabledScrollbarCount >= 1 || block.maxScrollLeft === 0,
			`expected wrapped block scrollbar disabled or no overflow: ${JSON.stringify(state)}`,
		);
		assert.equal(block.scrollLeft, 0, `expected wrapped block not to scroll horizontally: ${JSON.stringify(state)}`);
	}
});

async function performHorizontalScroll(gesture: HorizontalScrollGesture): Promise<HorizontalScrollState> {
	await horizontalScrollPage.resetScrollPositions(activeHorizontalScrollMode);
	const state = await horizontalScrollPage.performGesture(activeHorizontalScrollMode, 0, gesture);
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-${gesture}`, state);
	return state;
}

async function currentHorizontalScrollState(label: string): Promise<HorizontalScrollState> {
	lastHorizontalScrollState = await horizontalScrollPage.collectScrollState(activeHorizontalScrollMode, label);
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-${label}`, lastHorizontalScrollState);
	return lastHorizontalScrollState;
}
