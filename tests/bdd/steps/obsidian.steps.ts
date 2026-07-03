import { Given, Then, When } from '@wdio/cucumber-framework';
import { strict as assert } from 'node:assert';
import {
	horizontalScrollPage,
	type ExactEditResult,
	type HorizontalScrollGesture,
	type HorizontalScrollMode,
	type HorizontalScrollState,
} from '../pages/HorizontalScroll.page.js';
import { obsidianApp } from '../pages/ObsidianApp.page.js';
import { writeJsonArtifact } from '../support/artifacts.js';

let lastExpectedRenderText = '';
let activeHorizontalScrollMode: HorizontalScrollMode = 'reading';
let lastHorizontalScrollState: HorizontalScrollState | undefined;
let lastExactEdit: ExactEditResult | undefined;

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
	await horizontalScrollPage.openFixture(notePath, activeHorizontalScrollMode);
	lastHorizontalScrollState = await horizontalScrollPage.waitForHorizontalScrollReady(activeHorizontalScrollMode, 1, true);
});

Given('the fixture note {string} is open in Live Preview for horizontal scroll', async (notePath: string) => {
	activeHorizontalScrollMode = 'live-preview';
	await horizontalScrollPage.openFixture(notePath, activeHorizontalScrollMode);
	lastHorizontalScrollState = await horizontalScrollPage.waitForHorizontalScrollReady(
		activeHorizontalScrollMode,
		notePath.includes('multi') ? 2 : 1,
		!notePath.includes('wrapped'),
	);
});

Given('the fixture note {string} is open in raw Source mode for horizontal scroll', async (notePath: string) => {
	activeHorizontalScrollMode = 'source';
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

Then('the active note should keep horizontal scroll inside the first code block', async () => {
	const state = await currentHorizontalScrollState('assert-block-scroll');
	const first = state.blocks[0];
	assert.ok(first, 'expected a first code block');
	assert.ok(first.scrollbarCount >= 1, `expected at least one block scrollbar: ${JSON.stringify(state)}`);
	assert.ok(first.visibleScrollbarCount >= 1 || first.scrollLeft > 0, `expected visible scrollbar or scrolled block: ${JSON.stringify(state)}`);
	assert.ok(first.scrollLeft > 0, `expected first block to scroll horizontally: ${JSON.stringify(state)}`);
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(state)}`);
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
