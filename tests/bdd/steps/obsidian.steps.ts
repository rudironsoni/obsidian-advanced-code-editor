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
	type HorizontalScrollWheelLatencyResult,
} from '../pages/HorizontalScroll.page.js';
import { obsidianApp } from '../pages/ObsidianApp.page.js';
import { artifactDir, writeJsonArtifact } from '../support/artifacts.js';

let lastExpectedRenderText = '';
let activeHorizontalScrollMode: HorizontalScrollMode = 'reading';
let activeHorizontalScrollNotePath = '';
let lastHorizontalScrollState: HorizontalScrollState | undefined;
let lastExactEdit: ExactEditResult | undefined;
let lastHorizontalScrollPerformance: HorizontalScrollPerformanceResult | undefined;
let lastHorizontalScrollWheelLatency: HorizontalScrollWheelLatencyResult | undefined;
let lastHorizontalScrollLineNumberLayout: HorizontalScrollLineNumberLayoutComparison | undefined;

Given('the built Advanced Code Editor plugin is enabled in the fixture vault', async () => {
	await obsidianApp.waitForPluginLoaded();
});

Given('the fixture note {string} is open in reading mode', async (notePath: string) => {
	await obsidianApp.openFixtureInReadingMode(notePath);
});

Given('the fixture note {string} is open in Live Preview', async (notePath: string) => {
	await obsidianApp.openFixtureInLivePreview(notePath);
});

Given('the fixture note {string} is open in raw Source mode', async (notePath: string) => {
	await obsidianApp.openFixtureInSourceMode(notePath);
});

Given('Obsidian is running in mobile emulation', async () => {
	await obsidianApp.expectMobileEmulation();
});

Given('Obsidian is sized like a phone portrait', async () => {
	await obsidianApp.resizeToPhonePortrait();
});

Given('theme confidence settings use a valid custom theme folder', async () => {
	await obsidianApp.prepareThemeConfidenceFixture();
});

Given('language support settings use validation fixtures', async () => {
	await obsidianApp.prepareLanguageSupportFixture();
});

Given('code block defaults hide line numbers and do not wrap', async () => {
	await obsidianApp.applyCodeBlockSettings({ showLineNumbers: false, wrapLines: false });
});

Given('code block defaults show line numbers and wrap', async () => {
	await obsidianApp.applyCodeBlockSettings({ showLineNumbers: true, wrapLines: true });
});

When('Obsidian renders the active note', async () => {
	if (!lastExpectedRenderText) {
		lastExpectedRenderText = 'const wdioValue';
	}
	await obsidianApp.waitForReadingRender(lastExpectedRenderText);
});

When('I collapse and expand the left sidebar', async () => {
	await obsidianApp.collapseAndExpandLeftSidebar();
});

When('I move focus away from the note', async () => {
	await obsidianApp.moveFocusAwayFromNote();
});

Then('the Advanced Code Editor plugin should be loaded from the built payload', async () => {
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
	assert.ok(!state.text.includes('```'), `expected rendered code text not to include Markdown fences: ${JSON.stringify(state)}`);
	assert.ok(state.width > 80, 'expected visible block width');
	assert.ok(state.height > 20, 'expected visible block height');
});

Then('Reading mode should color repeated C# generic type names consistently', async () => {
	const state = await obsidianApp.getReadingRenderState();
	const distinctListColors = new Set(state.csharpListTokenColors);

	assert.ok(!state.text.includes('```'), `expected rendered code text not to include Markdown fences: ${JSON.stringify(state)}`);
	assert.ok(state.text.includes('List<int[]> intervals'), `expected first C# generic declaration: ${JSON.stringify(state)}`);
	assert.ok(state.text.includes('List<int[]> expectedResult'), `expected second C# generic declaration: ${JSON.stringify(state)}`);
	assert.ok(state.text.includes('List<int[]> mergedIntervals'), `expected later C# generic declaration: ${JSON.stringify(state)}`);
	assert.ok(state.csharpListTokenColors.length >= 3, `expected at least three Shiki-owned List tokens: ${JSON.stringify(state)}`);
	assert.equal(distinctListColors.size, 1, `expected repeated C# List type tokens to use one color: ${JSON.stringify(state)}`);
});

Then('Reading mode should render one visual row per source line', async () => {
	const state = await obsidianApp.getReadingRenderState();
	writeJsonArtifact(`reading-line-layout-${state.isMobile ? 'mobile' : 'desktop'}`, state);

	assert.ok(state.renderedLineCount > 1, `expected multiple rendered source lines: ${JSON.stringify(state)}`);
	assert.equal(state.renderedLineCount, state.numberedLineCount, `expected one numbered row per rendered source line: ${JSON.stringify(state)}`);
	assert.ok(state.codeLineHeight > 0, `expected a measurable Reading mode line height: ${JSON.stringify(state)}`);
	for (const delta of state.lineTopDeltas) {
		assert.ok(Math.abs(delta - state.codeLineHeight) <= 1, `expected adjacent Reading mode rows to advance by one line height: ${JSON.stringify(state)}`);
	}
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `reading-line-layout-${state.isMobile ? 'mobile' : 'desktop'}.png`));
});

Then('the Live Preview code block should style the full source text {string}', async (expectedText: string) => {
	const state = await obsidianApp.waitForLivePreviewStyledSource(expectedText);

	assert.ok(state.lines >= 1, 'expected at least one Live Preview code line');
	assert.ok(state.tokens > 0, 'expected syntax-highlighted token spans');
	assert.ok(state.text.includes(expectedText), 'expected Live Preview code text');
	assert.ok(
		compactSyntaxText(state.styledText).includes(compactSyntaxText(expectedText)),
		`expected styled token text to include ${expectedText}, got ${JSON.stringify(state)}`,
	);
	assert.ok(state.distinctTokenColorCount >= 3, `expected several distinct Shiki token colors: ${JSON.stringify(state)}`);
	assert.ok(state.visibleTokenCount >= 5, `expected visible Shiki token glyphs: ${JSON.stringify(state)}`);
	assert.equal(state.transparentTokenCount, 0, `expected no transparent Shiki token colors: ${JSON.stringify(state)}`);
	assert.ok(state.width > 80, 'expected visible Live Preview code line width');
	assert.ok(state.height > 10, 'expected visible Live Preview code line height');
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `syntax-live-preview-${state.isMobile ? 'mobile' : 'desktop'}.png`));
});

Then('the Live Preview code block should keep visible Shiki token colors for {string}', async (expectedText: string) => {
	const state = await obsidianApp.waitForLivePreviewStyledSource(expectedText);

	assert.ok(state.text.includes(expectedText), `expected Live Preview code text after layout change: ${JSON.stringify(state)}`);
	assert.ok(state.distinctTokenColorCount >= 3, `expected several distinct Shiki token colors after layout change: ${JSON.stringify(state)}`);
	assert.ok(state.visibleTokenCount >= 5, `expected visible Shiki token glyphs after layout change: ${JSON.stringify(state)}`);
	assert.equal(state.transparentTokenCount, 0, `expected no transparent Shiki token colors after layout change: ${JSON.stringify(state)}`);
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `syntax-live-preview-layout-change-${state.isMobile ? 'mobile' : 'desktop'}.png`));
});

Then('Live Preview fence rows should keep a visible editor cursor', async () => {
	const state = await obsidianApp.getLivePreviewFenceCursorState();
	const transparent = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)']);
	writeJsonArtifact(`live-preview-fence-cursor-${state.isMobile ? 'mobile' : 'desktop'}`, state);

	for (const probe of [state.opening, state.closing]) {
		assert.ok(probe.lineText.trim().startsWith('```'), `expected cursor probe to target a fence row: ${JSON.stringify(state)}`);
		assert.equal(probe.fenceLineHasFenceClass, true, `expected probed editor line to be the fence row: ${JSON.stringify(state)}`);
		assert.equal(transparent.has(probe.caretColor), false, `expected visible fence line caret color: ${JSON.stringify(state)}`);
	}
});

Then('raw Source mode should keep C# fenced code editable with Shiki token colors for {string}', async (expectedText: string) => {
	const state = await obsidianApp.waitForSourceModeShiki(expectedText);

	assert.equal(state.rawFenceVisible, true, `expected raw Markdown fences to remain visible: ${JSON.stringify(state)}`);
	assert.ok(state.text.includes(expectedText), `expected raw Source code text: ${JSON.stringify(state)}`);
	assert.ok(state.pluginTokenCount > 0, `expected plugin-owned Shiki source tokens: ${JSON.stringify(state)}`);
	assert.ok(state.distinctTokenColorCount >= 3, `expected several distinct Shiki source token colors: ${JSON.stringify(state)}`);
	assert.ok(state.visibleTokenCount >= 5, `expected visible Shiki source token glyphs: ${JSON.stringify(state)}`);
	assert.equal(state.transparentTokenCount, 0, `expected no transparent Shiki source token colors: ${JSON.stringify(state)}`);
	assert.equal(state.monacoEditorCount, 0, `expected Source mode not to mount Monaco: ${JSON.stringify(state)}`);
	assert.equal(state.renderedBlockChromeCount, 0, `expected Source mode not to render block chrome: ${JSON.stringify(state)}`);
	assert.equal(state.internalLineNumberCount, 0, `expected Source mode not to render internal line numbers: ${JSON.stringify(state)}`);
	assert.equal(state.blockScrollRowCount, 0, `expected Source mode not to use rendered block scroll rows: ${JSON.stringify(state)}`);
	assert.equal(state.blockScrollbarCount, 0, `expected Source mode not to render block scrollbar: ${JSON.stringify(state)}`);
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `syntax-source-mode-${state.isMobile ? 'mobile' : 'desktop'}.png`));
});

Then('raw Source mode background should match the selected Shiki theme', async () => {
	const state = await obsidianApp.getSourceModeSyntaxState();

	assert.ok(state.activeTheme, `expected active Shiki theme id: ${JSON.stringify(state)}`);
	assert.ok(state.expectedThemeBackground, `expected Shiki theme background for ${state.activeTheme}: ${JSON.stringify(state)}`);
	assert.equal(state.backgroundMatchesExpected, true, `expected Source Mode background to match ${state.activeTheme}: ${JSON.stringify(state)}`);
});

Then('the theme settings should show active theme confidence and custom theme validation', async () => {
	const state = await obsidianApp.waitForThemeSettingsConfidence();

	assert.equal(state.dark.configuredTheme, 'obsidian-theme', `expected dark theme to keep Obsidian-theme default: ${JSON.stringify(state)}`);
	assert.equal(state.dark.effectiveTheme, 'github-dark', `expected dark theme confidence to show effective GitHub Dark: ${JSON.stringify(state)}`);
	assert.ok(state.dark.text.includes('GitHub Dark'), `expected dark theme text to name GitHub Dark: ${JSON.stringify(state)}`);
	assert.equal(state.light.configuredTheme, 'obsidian-theme', `expected light theme to keep Obsidian-theme default: ${JSON.stringify(state)}`);
	assert.equal(state.light.effectiveTheme, 'github-light', `expected light theme confidence to show effective GitHub Light: ${JSON.stringify(state)}`);
	assert.ok(state.light.text.includes('GitHub Light'), `expected light theme text to name GitHub Light: ${JSON.stringify(state)}`);
	assert.equal(state.validation.state, 'valid', `expected custom theme folder validation to be valid: ${JSON.stringify(state)}`);
	assert.ok(state.validation.loadableThemeCount >= 1, `expected at least one loadable custom theme: ${JSON.stringify(state)}`);
	assert.ok(state.validation.text.includes('WDIO Theme'), `expected validation text to name fixture theme: ${JSON.stringify(state)}`);
});

Then('the language settings should show disabled-language and custom-language validation', async () => {
	const state = await obsidianApp.waitForLanguageSettingsValidation();

	assert.equal(state.customLanguage.state, 'valid', `expected custom language folder validation to be valid: ${JSON.stringify(state)}`);
	assert.ok(state.customLanguage.loadableLanguageCount >= 1, `expected at least one loadable custom language: ${JSON.stringify(state)}`);
	assert.ok(state.customLanguage.text.includes('WDIO Language'), `expected validation text to name fixture language: ${JSON.stringify(state)}`);
	assert.equal(state.disabledLanguages.state, 'warning', `expected disabled language validation warning: ${JSON.stringify(state)}`);
	assert.equal(state.disabledLanguages.disabledLanguageCount, 2, `expected normalized disabled languages: ${JSON.stringify(state)}`);
	assert.ok(state.disabledLanguages.duplicateLanguageCount >= 1, `expected duplicate disabled language warning: ${JSON.stringify(state)}`);
	assert.ok(state.disabledLanguages.unknownLanguageCount >= 1, `expected unknown disabled language warning: ${JSON.stringify(state)}`);
	assert.ok(state.disabledLanguages.matrixLanguageCount >= 1, `expected matrix-backed disabled language warning: ${JSON.stringify(state)}`);
	assert.ok(state.disabledLanguages.text.includes('matrix-covered'), `expected matrix-backed warning text: ${JSON.stringify(state)}`);
});

Then('the Shiki theme background should match in {word}', async (mode: 'reading' | 'live-preview' | 'source') => {
	const state = await obsidianApp.waitForThemeBackground(mode);

	assert.ok(state.activeTheme, `expected active Shiki theme id: ${JSON.stringify(state)}`);
	assert.ok(state.expectedThemeBackground, `expected Shiki theme background for ${state.activeTheme}: ${JSON.stringify(state)}`);
	assert.equal(state.visibleTargetCount, 1, `expected visible background target in ${mode}: ${JSON.stringify(state)}`);
	assert.equal(state.backgroundMatchesExpected, true, `expected ${mode} background to match ${state.activeTheme}: ${JSON.stringify(state)}`);
	if (mode !== 'source') {
		assert.equal(
			state.gutterBackgroundMatchesExpected,
			true,
			`expected ${mode} line-number gutter background to match ${state.activeTheme}: ${JSON.stringify(state)}`,
		);
	}
});

Then('code block metadata should render consistently in {word}', async (mode: 'reading' | 'live-preview') => {
	const state = await obsidianApp.waitForMetadataParity(mode);
	const parityBlock = state.blocks.find(block => block.title === 'Parity metadata block');
	const diffBlock = state.blocks.find(block => block.title === 'Diff metadata block');

	assert.ok(parityBlock, `expected metadata block in ${mode}: ${JSON.stringify(state)}`);
	assert.equal(parityBlock.language, 'ts', `expected title and language in ${mode}: ${JSON.stringify(parityBlock)}`);
	assert.deepEqual(parityBlock.lineNumberTexts, ['1', '2', '3', '4'], `expected showLineNumbers metadata in ${mode}: ${JSON.stringify(parityBlock)}`);
	assert.ok(parityBlock.nowrapClassPresent, `expected nowrap default class in ${mode}: ${JSON.stringify(parityBlock)}`);
	assert.ok(
		parityBlock.highlightedLineTexts.some(text => text.includes('highlighted')),
		`expected highlighted line in ${mode}: ${JSON.stringify(parityBlock)}`,
	);
	assert.ok(
		parityBlock.insertedLineTexts.some(text => text.includes('inserted')),
		`expected inserted line in ${mode}: ${JSON.stringify(parityBlock)}`,
	);
	assert.ok(
		parityBlock.deletedLineTexts.some(text => text.includes('deleted')),
		`expected deleted line in ${mode}: ${JSON.stringify(parityBlock)}`,
	);

	assert.ok(diffBlock, `expected diff metadata block in ${mode}: ${JSON.stringify(state)}`);
	assert.equal(diffBlock.language, 'diff', `expected diff language in ${mode}: ${JSON.stringify(diffBlock)}`);
	assert.deepEqual(diffBlock.lineNumberTexts, ['1', '2', '3'], `expected diff line numbers in ${mode}: ${JSON.stringify(diffBlock)}`);
	assert.ok(
		diffBlock.insertedLineTexts.some(text => text.includes('added line')),
		`expected diff inserted prefix in ${mode}: ${JSON.stringify(diffBlock)}`,
	);
	assert.ok(
		diffBlock.deletedLineTexts.some(text => text.includes('removed line')),
		`expected diff deleted prefix in ${mode}: ${JSON.stringify(diffBlock)}`,
	);
});

Then('wrapped code block metadata should render consistently in {word}', async (mode: 'reading' | 'live-preview') => {
	const state = await obsidianApp.waitForMetadataParity(mode);
	const parityBlock = state.blocks.find(block => block.title === 'Parity metadata block');

	assert.ok(parityBlock, `expected metadata block in ${mode}: ${JSON.stringify(state)}`);
	assert.ok(parityBlock.wrapClassPresent, `expected wrap default class in ${mode}: ${JSON.stringify(parityBlock)}`);
	assert.deepEqual(
		parityBlock.lineNumberTexts,
		['1', '2', '3', '4'],
		`expected line numbers under wrapped defaults in ${mode}: ${JSON.stringify(parityBlock)}`,
	);
});

Then('the syntax language matrix should have Shiki-owned token colors in {word}', async (mode: 'reading' | 'live-preview' | 'source') => {
	const state = await obsidianApp.waitForSyntaxLanguageMatrix(mode);

	for (const probe of state.probes) {
		assert.equal(probe.linePresent, true, `expected ${probe.language} source line in ${mode}: ${JSON.stringify(probe)}`);
		assert.ok(probe.pluginTokenCount >= probe.needles.length, `expected plugin-owned tokens for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`);
		assert.ok(probe.distinctTokenColorCount >= 2, `expected multiple Shiki token colors for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`);
		assert.equal(probe.transparentTokenCount, 0, `expected no transparent Shiki tokens for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`);
		assert.ok(probe.visibleTokenCount >= probe.needles.length, `expected visible Shiki tokens for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`);
		for (const needle of probe.needles) {
			assert.equal(needle.found, true, `expected Shiki-owned token ${needle.needle} for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`);
			assert.equal(
				needle.visible,
				true,
				`expected visible Shiki-owned token ${needle.needle} for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`,
			);
			assert.equal(
				needle.transparent,
				false,
				`expected non-transparent Shiki-owned token ${needle.needle} for ${probe.language} in ${mode}: ${JSON.stringify(probe)}`,
			);
		}
	}
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `syntax-language-matrix-${mode}-${state.isMobile ? 'mobile' : 'desktop'}.png`));
});

Then('the rendered copy control should copy {string} and keep stable states in {word}', async (expectedText: string, mode: 'reading' | 'live-preview') => {
	const state = await obsidianApp.verifyCopyControl(mode);

	assert.ok(state.successWrite.includes(expectedText), `expected copy control to write current code text: ${JSON.stringify(state)}`);
	assert.ok(state.errorWrite.includes(expectedText), `expected failed copy attempt to use current code text: ${JSON.stringify(state)}`);
	assert.equal(state.initialText, 'Copy', `expected idle copy label: ${JSON.stringify(state)}`);
	assert.equal(state.copiedText, 'Copied', `expected copied label: ${JSON.stringify(state)}`);
	assert.equal(state.errorText, 'Error', `expected error label: ${JSON.stringify(state)}`);
	assert.equal(state.initialState, 'idle', `expected idle copy state: ${JSON.stringify(state)}`);
	assert.equal(state.copiedState, 'copied', `expected copied state: ${JSON.stringify(state)}`);
	assert.equal(state.errorState, 'error', `expected error state: ${JSON.stringify(state)}`);
	assert.equal(state.initialAriaLabel, 'Copy code block', `expected idle aria label: ${JSON.stringify(state)}`);
	assert.equal(state.copiedAriaLabel, 'Code copied', `expected copied aria label: ${JSON.stringify(state)}`);
	assert.equal(state.errorAriaLabel, 'Copy failed', `expected error aria label: ${JSON.stringify(state)}`);
	assert.ok(Math.abs(state.initialWidth - state.copiedWidth) <= 1, `expected copied state not to change button width: ${JSON.stringify(state)}`);
	assert.ok(Math.abs(state.initialWidth - state.errorWidth) <= 1, `expected error state not to change button width: ${JSON.stringify(state)}`);
	assert.ok(Math.abs(state.initialHeight - state.copiedHeight) <= 1, `expected copied state not to change button height: ${JSON.stringify(state)}`);
	assert.ok(Math.abs(state.initialHeight - state.errorHeight) <= 1, `expected error state not to change button height: ${JSON.stringify(state)}`);
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `copy-control-${mode}-${state.isMobile ? 'mobile' : 'desktop'}.png`));
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
	lastHorizontalScrollState = await horizontalScrollPage.waitForRawSourceReady(notePath);
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

When('I force the first Live Preview row past its native scroll range', async () => {
	assert.equal(activeHorizontalScrollMode, 'live-preview', 'expected native row overflow to run in Live Preview');
	await horizontalScrollPage.resetScrollPositions(activeHorizontalScrollMode);
	lastHorizontalScrollState = await horizontalScrollPage.forceNativeRowOverflowScroll(activeHorizontalScrollMode, 0);
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-native-row-overflow`, lastHorizontalScrollState);
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `horizontal-scroll-${activeHorizontalScrollMode}-native-row-overflow.png`));
});

When('I edit the visible horizontal scroll marker', async () => {
	lastExactEdit = await horizontalScrollPage.editMarkerAfterScroll();
	let observedState: HorizontalScrollState | undefined;
	await browser.waitUntil(
		async () => {
			observedState = await horizontalScrollPage.collectScrollState(activeHorizontalScrollMode, 'after-exact-edit');
			return (observedState.blocks[0]?.scrollLeft ?? 0) > 0;
		},
		{
			timeout: 5000,
			timeoutMsg: 'Horizontal scroll was not restored after exact edit',
		},
	);
	lastHorizontalScrollState = observedState;
	writeJsonArtifact('horizontal-scroll-exact-edit', { edit: lastExactEdit, scroll: lastHorizontalScrollState });
});

When('I edit the raw Source mode horizontal scroll marker', async () => {
	assert.equal(activeHorizontalScrollMode, 'source', 'expected raw Source mode before editing source marker');
	lastExactEdit = await horizontalScrollPage.editMarkerAfterScroll();
	lastHorizontalScrollState = await horizontalScrollPage.collectScrollState(activeHorizontalScrollMode, 'after-source-edit');
	writeJsonArtifact('horizontal-scroll-source-exact-edit', { edit: lastExactEdit, scroll: lastHorizontalScrollState });
});

When('I repeatedly scroll the first code block horizontally with wheel gestures', async () => {
	let referenceMetrics: HorizontalScrollPerformanceResult['metrics'] | undefined;
	if (activeHorizontalScrollMode === 'live-preview' && activeHorizontalScrollNotePath) {
		await horizontalScrollPage.openFixture(activeHorizontalScrollNotePath, 'reading');
		await horizontalScrollPage.waitForHorizontalScrollReady('reading', 1, true);
		await horizontalScrollPage.resetScrollPositions('reading');
		referenceMetrics = (await horizontalScrollPage.measureRepeatedWheelScroll('reading', 0)).metrics;
		await horizontalScrollPage.openFixture(activeHorizontalScrollNotePath, 'live-preview');
		await horizontalScrollPage.waitForHorizontalScrollReady('live-preview', 1, true);
		activeHorizontalScrollMode = 'live-preview';
	}
	await horizontalScrollPage.resetScrollPositions(activeHorizontalScrollMode);
	lastHorizontalScrollPerformance = await horizontalScrollPage.measureRepeatedWheelScroll(activeHorizontalScrollMode, 0);
	lastHorizontalScrollPerformance.referenceMetrics = referenceMetrics;
	lastHorizontalScrollState = lastHorizontalScrollPerformance.state;
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-wheel-performance`, lastHorizontalScrollPerformance);
});

When('I repeatedly scroll the first code block horizontally with touch gestures', async () => {
	assert.equal(activeHorizontalScrollMode, 'live-preview', 'expected repeated touch performance check to run in Live Preview');
	await horizontalScrollPage.resetScrollPositions(activeHorizontalScrollMode);
	lastHorizontalScrollPerformance = await horizontalScrollPage.measureRepeatedTouchScroll(activeHorizontalScrollMode, 0);
	lastHorizontalScrollState = lastHorizontalScrollPerformance.state;
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-touch-performance`, lastHorizontalScrollPerformance);
});

When('I send one horizontal wheel event to the first Live Preview code block', async () => {
	assert.equal(activeHorizontalScrollMode, 'live-preview', 'expected first-wheel latency check to run in Live Preview');
	await horizontalScrollPage.resetScrollPositions(activeHorizontalScrollMode);
	lastHorizontalScrollWheelLatency = await horizontalScrollPage.measureFirstWheelLatency(activeHorizontalScrollMode, 0);
	lastHorizontalScrollState = lastHorizontalScrollWheelLatency.state;
	writeJsonArtifact('horizontal-scroll-live-preview-first-wheel-latency', lastHorizontalScrollWheelLatency);
});

When('I wheel overscroll the first code block past the right edge', async () => {
	assert.equal(activeHorizontalScrollMode, 'live-preview', 'expected right-edge overscroll to run in Live Preview');
	lastHorizontalScrollState = await horizontalScrollPage.wheelOverscrollRightEdge(activeHorizontalScrollMode, 0);
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-right-edge-overscroll`, lastHorizontalScrollState);
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
		assertLivePreviewBlockUsesSharedRowScroll(state, first);
	}
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(state)}`);
});

Then('the Live Preview code text should remain visible inside the code block', async () => {
	const state = await currentHorizontalScrollState('assert-code-visible');
	const first = state.blocks[0];
	assert.ok(first, 'expected a first code block');
	assert.equal(state.mode, 'live-preview', `expected Live Preview mode: ${JSON.stringify(state)}`);
	assert.ok(first.maxScrollLeft > 0, `expected overflowing Live Preview block content: ${JSON.stringify(state)}`);
	assert.ok(first.visibleScrollbarCount >= 1, `expected visible Live Preview block scrollbar: ${JSON.stringify(state)}`);
	assertLivePreviewCodeTextVisible(state, first);
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(state)}`);
});

Then('Live Preview horizontal scrolling should stay responsive', async () => {
	assert.ok(lastHorizontalScrollPerformance, 'expected Live Preview horizontal scroll performance result');
	const { metrics, state } = lastHorizontalScrollPerformance;
	const first = state.blocks[0];
	assert.ok(first, `expected a first code block after performance scroll: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(state.mode, 'live-preview', `expected Live Preview mode: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.eventCount >= 55, `expected at least 55 measured scroll events: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.p95DispatchMs <= 12, `expected p95 scroll dispatch under 12ms: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(metrics.maxDispatchMs <= 50, `expected max scroll dispatch under 50ms: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(
		(lastHorizontalScrollPerformance.responsivenessProbeMs ?? 0) <= 250,
		`expected post-scroll responsiveness probe under 250ms: ${JSON.stringify(lastHorizontalScrollPerformance)}`,
	);
	if (lastHorizontalScrollPerformance.referenceMetrics) {
		const reference = lastHorizontalScrollPerformance.referenceMetrics;
		assert.ok(
			metrics.p95DispatchMs <= reference.p95DispatchMs * 3 + 4,
			`expected Live Preview p95 dispatch to stay near Reading mode: ${JSON.stringify(lastHorizontalScrollPerformance)}`,
		);
		assert.ok(
			metrics.maxDispatchMs <= reference.maxDispatchMs * 3 + 16,
			`expected Live Preview max dispatch to stay near Reading mode: ${JSON.stringify(lastHorizontalScrollPerformance)}`,
		);
		assert.ok(
			metrics.maxFrameGapMs <= reference.maxFrameGapMs * 2 + 32,
			`expected Live Preview frame gaps not to regress far beyond Reading mode: ${JSON.stringify(lastHorizontalScrollPerformance)}`,
		);
	}
	assert.equal(metrics.backtrackCount, 0, `expected horizontal scroll not to jump backward: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(metrics.maxBacktrackPx, 0, `expected no horizontal scroll backtrack distance: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.ok(first.scrollLeft > 0, `expected first block to scroll horizontally: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(lastHorizontalScrollPerformance)}`);
	assertLivePreviewBlockUsesSharedRowScroll(state, first);
});

Then('Live Preview should move horizontally during the same wheel event', async () => {
	assert.ok(lastHorizontalScrollWheelLatency, 'expected Live Preview first-wheel latency result');
	const result = lastHorizontalScrollWheelLatency;
	const first = result.state.blocks[0];
	assert.ok(first, `expected a first code block after first wheel event: ${JSON.stringify(result)}`);
	assert.equal(result.state.mode, 'live-preview', `expected Live Preview mode: ${JSON.stringify(result)}`);
	assert.ok(
		result.scrollLeftImmediatelyAfterDispatch > 0,
		`expected first wheel event to move block before the next animation frame: ${JSON.stringify(result)}`,
	);
	assert.ok(
		result.scrollLeftAfterOneAnimationFrame >= result.scrollLeftImmediatelyAfterDispatch,
		`expected scroll position not to regress after one animation frame: ${JSON.stringify(result)}`,
	);
	assert.ok(result.dispatchMs <= 12, `expected first wheel dispatch under 12ms: ${JSON.stringify(result)}`);
	assert.equal(result.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(result)}`);
	assert.equal(result.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(result)}`);
	assertLivePreviewBlockUsesSharedRowScroll(result.state, first);
});

Then('the first Live Preview code block should remain at its horizontal end', async () => {
	const state = lastHorizontalScrollState ?? (await currentHorizontalScrollState('assert-right-edge'));
	const first = state.blocks[0];
	assert.ok(first, `expected a first code block: ${JSON.stringify(state)}`);
	assert.equal(state.mode, 'live-preview', `expected Live Preview mode: ${JSON.stringify(state)}`);
	assert.ok(first.maxScrollLeft > 0, `expected overflowing Live Preview block content: ${JSON.stringify(state)}`);
	assert.ok(first.scrollLeft > 0, `expected first block to remain horizontally scrolled: ${JSON.stringify(state)}`);
	assertLivePreviewBlockUsesSharedRowScroll(state, first);
	assert.equal(state.noteScrollLeft, 0, `expected note/editor scrollLeft to remain 0: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0: ${JSON.stringify(state)}`);
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
	assert.ok(
		livePreviewBlock.nativeBlockGutterCount > 0,
		`expected native editor gutter to remain visible over the Live Preview code block: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
	assert.ok(
		livePreviewBlock.gutterToCodeGap !== null && readingBlock.gutterToCodeGap !== null,
		`expected measurable code gutter gaps: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
	assert.ok(
		Math.abs(livePreviewBlock.gutterToCodeGap - readingBlock.gutterToCodeGap) <= 2,
		`expected Live Preview gutter/code gap to match Reading mode: ${JSON.stringify(lastHorizontalScrollLineNumberLayout)}`,
	);
	const layoutJson = JSON.stringify(lastHorizontalScrollLineNumberLayout);
	const assertPixelClose = (actual: number | null, expected: number | null, label: string, tolerance = 2): void => {
		assert.ok(actual !== null && expected !== null, `expected measurable ${label}: ${layoutJson}`);
		assert.ok(Math.abs(actual - expected) <= tolerance, `expected Live Preview ${label} to match Reading mode: ${layoutJson}`);
	};
	const assertStyleEqual = (actual: string | null, expected: string | null, label: string): void => {
		assert.ok(actual !== null && expected !== null, `expected measurable ${label}: ${layoutJson}`);
		assert.equal(actual, expected, `expected Live Preview ${label} to match Reading mode: ${layoutJson}`);
	};
	assert.equal(
		livePreviewBlock.gutterBorderRightWidth,
		readingBlock.gutterBorderRightWidth,
		`expected Live Preview gutter separator width to match Reading mode: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.gutterBorderRightColor,
		readingBlock.gutterBorderRightColor,
		`expected Live Preview gutter separator color to match Reading mode: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.gutterMaskBorderLeftWidth,
		readingBlock.gutterBorderRightWidth,
		`expected Live Preview gutter mask to preserve the separator width: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.gutterMaskBorderLeftColor,
		readingBlock.gutterBorderRightColor,
		`expected Live Preview gutter mask to preserve the separator color: ${layoutJson}`,
	);
	assertPixelClose(livePreviewBlock.gutterWidth, readingBlock.gutterWidth, 'line-number gutter width');
	assertPixelClose(
		livePreviewBlock.gutterRight !== null && livePreviewBlock.firstLineNumberTextRight !== null
			? livePreviewBlock.gutterRight - livePreviewBlock.firstLineNumberTextRight
			: null,
		readingBlock.gutterRight !== null && readingBlock.firstLineNumberTextRight !== null
			? readingBlock.gutterRight - readingBlock.firstLineNumberTextRight
			: null,
		'line-number text right inset',
	);
	assertStyleEqual(livePreviewBlock.gutterMinWidth, readingBlock.gutterMinWidth, 'line-number gutter minimum width');
	assertStyleEqual(livePreviewBlock.gutterPaddingRight, readingBlock.gutterPaddingRight, 'line-number gutter right padding');
	assertStyleEqual(livePreviewBlock.gutterBackgroundColor, readingBlock.gutterBackgroundColor, 'line-number gutter background');
	assertStyleEqual(livePreviewBlock.gutterColor, readingBlock.gutterColor, 'line-number gutter text color');
	assertStyleEqual(livePreviewBlock.gutterFontFamily, readingBlock.gutterFontFamily, 'line-number gutter font family');
	assertStyleEqual(livePreviewBlock.gutterFontSize, readingBlock.gutterFontSize, 'line-number gutter font size');
	assertStyleEqual(livePreviewBlock.gutterLineHeight, readingBlock.gutterLineHeight, 'line-number gutter line height');
	assertStyleEqual(livePreviewBlock.gutterTextAlign, readingBlock.gutterTextAlign, 'line-number gutter text alignment');
	assertStyleEqual(livePreviewBlock.gutterBoxSizing, readingBlock.gutterBoxSizing, 'line-number gutter box sizing');
	assert.ok(
		livePreviewBlock.gutterMaxVerticalGap !== null &&
			livePreviewBlock.gutterVerticalOverpaint !== null &&
			livePreviewBlock.gutterMaxVerticalGap <= livePreviewBlock.gutterVerticalOverpaint + 0.5,
		`expected Live Preview gutter rows to paint continuously across blank lines: ${layoutJson}`,
	);
	assert.ok(
		livePreviewBlock.rowMaxVerticalGap !== null &&
			livePreviewBlock.rowVerticalOverpaint !== null &&
			livePreviewBlock.rowMaxVerticalGap <= livePreviewBlock.rowVerticalOverpaint + 0.5,
		`expected Live Preview code rows to paint continuously across blank lines: ${layoutJson}`,
	);
	assert.ok(
		livePreviewBlock.gutterMarginRight !== null && Number.parseFloat(livePreviewBlock.gutterMarginRight) === readingBlock.gutterToCodeGap,
		`expected Live Preview gutter margin to equal Reading mode code gap: ${layoutJson}`,
	);
	assert.equal(livePreviewBlock.gutterJustifyContent, 'flex-end', `expected Live Preview line numbers to align to the gutter edge: ${layoutJson}`);
	const liveHeader = {
		right: livePreviewBlock.headerRight,
		height: livePreviewBlock.headerHeight,
		leftGroupLeft: livePreviewBlock.headerLeftGroupLeft,
		langLeft: livePreviewBlock.headerLangLeft,
		langCenterY: livePreviewBlock.headerLangCenterY,
		copyRight: livePreviewBlock.headerCopyRight,
		copyCenterY: livePreviewBlock.headerCopyCenterY,
	};
	const readingHeader = {
		right: readingBlock.headerRight,
		height: readingBlock.headerHeight,
		leftGroupLeft: readingBlock.headerLeftGroupLeft,
		langLeft: readingBlock.headerLangLeft,
		langCenterY: readingBlock.headerLangCenterY,
		copyRight: readingBlock.headerCopyRight,
		copyCenterY: readingBlock.headerCopyCenterY,
	};
	assert.equal(livePreviewBlock.headerDisplay, 'flex', `expected Live Preview block header to use flex layout: ${layoutJson}`);
	assert.equal(livePreviewBlock.headerFlexDirection, 'row', `expected Live Preview block header to use row layout: ${layoutJson}`);
	assert.equal(
		livePreviewBlock.headerBorderTopWidth,
		readingBlock.rootBorderTopWidth,
		`expected Live Preview header top border width to match Reading mode block: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.headerBorderTopColor,
		readingBlock.rootBorderTopColor,
		`expected Live Preview header border color to match Reading mode block: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.headerBorderLeftWidth,
		readingBlock.rootBorderTopWidth,
		`expected Live Preview header left border to be visible: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.headerBorderRightWidth,
		readingBlock.rootBorderTopWidth,
		`expected Live Preview header right border to be visible: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.rowBorderLeftWidth,
		readingBlock.rootBorderTopWidth,
		`expected Live Preview row left border to continue the block shell: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.rowBorderRightWidth,
		readingBlock.rootBorderTopWidth,
		`expected Live Preview row right border to continue the block shell: ${layoutJson}`,
	);
	assert.equal(
		livePreviewBlock.rowBorderRightColor,
		readingBlock.rootBorderTopColor,
		`expected Live Preview row border color to match Reading mode block: ${layoutJson}`,
	);
	if (
		liveHeader.right === null ||
		liveHeader.height === null ||
		liveHeader.leftGroupLeft === null ||
		liveHeader.langLeft === null ||
		liveHeader.langCenterY === null ||
		liveHeader.copyRight === null ||
		liveHeader.copyCenterY === null ||
		readingHeader.right === null ||
		readingHeader.height === null ||
		readingHeader.leftGroupLeft === null ||
		readingHeader.langLeft === null ||
		readingHeader.langCenterY === null ||
		readingHeader.copyRight === null ||
		readingHeader.copyCenterY === null
	) {
		assert.fail(`expected measurable block header child geometry: ${layoutJson}`);
	}
	assert.ok(Math.abs(liveHeader.height - readingHeader.height) <= 2, `expected Live Preview block header height to match Reading mode: ${layoutJson}`);
	assert.ok(Math.abs(liveHeader.right - readingHeader.right) <= 2, `expected Live Preview block header right edge to match Reading mode: ${layoutJson}`);
	assert.ok(
		livePreviewBlock.rowLeft !== null && livePreviewBlock.headerLeft !== null && Math.abs(livePreviewBlock.rowLeft - livePreviewBlock.headerLeft) <= 1,
		`expected Live Preview row left edge to align with header left edge: ${layoutJson}`,
	);
	assert.ok(
		livePreviewBlock.rowRight !== null && livePreviewBlock.headerRight !== null && Math.abs(livePreviewBlock.rowRight - livePreviewBlock.headerRight) <= 1,
		`expected Live Preview row right edge to align with header right edge: ${layoutJson}`,
	);
	assert.ok(
		Math.abs(liveHeader.copyRight - liveHeader.right - (readingHeader.copyRight - readingHeader.right)) <= 2,
		`expected Live Preview Copy button right padding to match Reading mode: ${layoutJson}`,
	);
	assert.ok(
		Math.abs(
			liveHeader.leftGroupLeft -
				(livePreviewBlock.headerLeft ?? liveHeader.leftGroupLeft) -
				(readingHeader.leftGroupLeft - (readingBlock.headerLeft ?? readingHeader.leftGroupLeft)),
		) <= 2,
		`expected Live Preview header left padding to match Reading mode: ${layoutJson}`,
	);
	assert.ok(
		Math.abs(liveHeader.langCenterY - liveHeader.copyCenterY) <= 2,
		`expected Live Preview language label and Copy button to stay on the same row: ${layoutJson}`,
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

Then('raw Source mode should stay native without rendered block chrome', async () => {
	const state = await currentHorizontalScrollState('assert-raw-source-native');
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `horizontal-scroll-source-raw-native-${state.isMobile ? 'mobile' : 'desktop'}.png`));
	assert.equal(activeHorizontalScrollMode, 'source');
	assert.equal(state.rawFenceVisible, true, `expected raw Markdown fences to remain visible: ${JSON.stringify(state)}`);
	assert.equal(state.monacoEditorCount, 0, `expected Source mode not to mount Monaco: ${JSON.stringify(state)}`);
	assert.ok(state.sourceNativeGutterCount > 0, `expected native Obsidian editor line numbers to remain visible: ${JSON.stringify(state)}`);
	assert.equal(state.sourceRenderedBlockChromeCount, 0, `expected Source mode not to render block header/copy/fence chrome: ${JSON.stringify(state)}`);
	assert.equal(state.sourceInternalLineNumberCount, 0, `expected Source mode not to render internal block line numbers: ${JSON.stringify(state)}`);
	assert.equal(state.sourceBlockScrollRowCount, 0, `expected Source mode rows not to use rendered block scroll classes: ${JSON.stringify(state)}`);
	assert.equal(state.sourceBlockScrollbarCount, 0, `expected Source mode not to render a block scrollbar widget: ${JSON.stringify(state)}`);
	assert.ok(state.sourceShikiTokenDecorationCount > 0, `expected Source mode fenced code to receive plugin Shiki token colors: ${JSON.stringify(state)}`);
	assert.equal(state.blockCount, 0, `expected Source mode not to expose plugin-owned rendered blocks: ${JSON.stringify(state)}`);
	assert.equal(state.noteScrollLeft, 0, `expected Source editor scrollLeft to remain 0 at rest: ${JSON.stringify(state)}`);
	assert.equal(state.documentScrollLeft, 0, `expected document scrollLeft to remain 0 at rest: ${JSON.stringify(state)}`);
});

Then('the exact edit should be written at the horizontal scroll marker', async () => {
	assert.ok(lastExactEdit, 'expected exact edit result');
	assert.equal(lastExactEdit.fileContainsEdit, true, `expected edit immediately after marker: ${JSON.stringify(lastExactEdit)}`);
	assert.ok(
		lastExactEdit.lineText.includes(`${horizontalScrollPage.marker}${horizontalScrollPage.editText}`),
		`expected edited line to contain marker edit: ${JSON.stringify(lastExactEdit)}`,
	);
	const state = await currentHorizontalScrollState('assert-exact-edit-scroll');
	if (state.mode !== 'source') {
		assert.ok(state.blocks[0]?.scrollLeft > 0, `expected scroll to survive exact edit: ${JSON.stringify(state)}`);
	}
});

Then('the first and second code blocks should keep independent horizontal scroll positions', async () => {
	const state = await currentHorizontalScrollState('assert-independent-blocks');
	assert.ok(state.blocks.length >= 2, `expected at least two code blocks: ${JSON.stringify(state)}`);
	assert.ok(state.blocks[0].scrollLeft > 0, `expected first block to be scrolled: ${JSON.stringify(state)}`);
	assert.equal(state.blocks[1].scrollLeft, 0, `expected second block to remain at scrollLeft 0: ${JSON.stringify(state)}`);
	if (state.mode === 'live-preview') {
		assertLivePreviewBlockUsesSharedRowScroll(state, state.blocks[0]);
		assert.equal(state.blocks[1].livePreviewContentTranslateXSpread, 0, `expected idle second block to have one visual offset: ${JSON.stringify(state)}`);
		for (const translateX of state.blocks[1].livePreviewContentTranslateXValues) {
			assert.equal(translateX, 0, `expected idle second Live Preview block content not to move: ${JSON.stringify(state)}`);
		}
	}
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
	mkdirSync(artifactDir, { recursive: true });
	await browser.saveScreenshot(path.join(artifactDir, `horizontal-scroll-${activeHorizontalScrollMode}-${gesture}.png`));
	return state;
}

async function currentHorizontalScrollState(label: string): Promise<HorizontalScrollState> {
	lastHorizontalScrollState = await horizontalScrollPage.collectScrollState(activeHorizontalScrollMode, label);
	writeJsonArtifact(`horizontal-scroll-${activeHorizontalScrollMode}-${label}`, lastHorizontalScrollState);
	return lastHorizontalScrollState;
}

function assertLivePreviewBlockUsesSharedRowScroll(state: HorizontalScrollState, block: HorizontalScrollState['blocks'][number]): void {
	if (block.scrollbarCount > 0) {
		assert.equal(block.scrollOwnerCount, 1, `expected mounted Live Preview scrollbar to own block scroll: ${JSON.stringify(state)}`);
	}
	assert.ok(block.rowScrollSurfaceCount > 0, `expected Live Preview block to expose horizontal scroll surfaces: ${JSON.stringify(state)}`);
	assert.ok(Math.abs(block.rowScrollLeftMin - block.scrollLeft) <= 1, `expected Live Preview rows to share the block scrollLeft: ${JSON.stringify(state)}`);
	assert.ok(Math.abs(block.rowScrollLeftMax - block.scrollLeft) <= 1, `expected Live Preview rows to share the block scrollLeft: ${JSON.stringify(state)}`);
	assert.ok(block.livePreviewContentCount > 0, `expected Live Preview code content marks to be measurable: ${JSON.stringify(state)}`);
	assert.ok(block.visibleCodeContentCount > 0, `expected Live Preview code content to keep a visible clipped rect: ${JSON.stringify(state)}`);
	assert.ok(block.hitTestableCodeContentCount > 0, `expected Live Preview code content to remain hit-testable after scroll: ${JSON.stringify(state)}`);
	assert.ok(block.visibleCodeGlyphCount > 0, `expected Live Preview code glyphs to remain visible after scroll: ${JSON.stringify(state)}`);
	assert.equal(block.overflowingCodeGlyphCount, 0, `expected Live Preview code glyphs not to escape the block clip rect: ${JSON.stringify(state)}`);
	assert.equal(block.transparentCodeContentCount, 0, `expected Live Preview code content not to become transparent after scroll: ${JSON.stringify(state)}`);
	assert.equal(block.gutterMasksScrolledContent, true, `expected Live Preview gutter to mask scrolled code content: ${JSON.stringify(state)}`);
	if (block.hasShortLineContent) {
		assert.notEqual(block.shortLineRowScrollLeft, null, `expected short Live Preview row to expose block scroll: ${JSON.stringify(state)}`);
		assert.ok(
			Math.abs((block.shortLineRowScrollLeft ?? 0) - block.scrollLeft) <= 1,
			`expected short Live Preview row to move with the whole block: ${JSON.stringify(state)}`,
		);
	}
}

function assertLivePreviewCodeTextVisible(state: HorizontalScrollState, block: HorizontalScrollState['blocks'][number]): void {
	assert.ok(block.rowScrollSurfaceCount > 0, `expected Live Preview block to expose horizontal scroll surfaces: ${JSON.stringify(state)}`);
	assert.ok(
		Math.abs(block.rowScrollLeftMin - block.rowScrollLeftMax) <= 1,
		`expected Live Preview rows not to keep independent native scroll offsets: ${JSON.stringify(state)}`,
	);
	assert.ok(block.livePreviewContentCount > 0, `expected Live Preview code content marks to be measurable: ${JSON.stringify(state)}`);
	assert.ok(block.livePreviewContentTranslateXSpread <= 1, `expected Live Preview code content to share one visual offset: ${JSON.stringify(state)}`);
	assert.ok(block.visibleCodeContentCount > 0, `expected Live Preview code content to keep a visible clipped rect: ${JSON.stringify(state)}`);
	assert.ok(block.hitTestableCodeContentCount > 0, `expected Live Preview code content to remain hit-testable: ${JSON.stringify(state)}`);
	assert.ok(block.visibleCodeGlyphCount > 0, `expected Live Preview code glyphs to remain visible: ${JSON.stringify(state)}`);
	assert.equal(block.overflowingCodeGlyphCount, 0, `expected Live Preview code glyphs not to escape the block clip rect: ${JSON.stringify(state)}`);
	assert.equal(block.transparentCodeContentCount, 0, `expected Live Preview code content not to become transparent: ${JSON.stringify(state)}`);
	assert.equal(block.gutterMasksScrolledContent, true, `expected Live Preview gutter to mask scrolled code content: ${JSON.stringify(state)}`);
	if (block.hasShortLineContent) {
		assert.notEqual(block.shortLineRowScrollLeft, null, `expected short Live Preview row to expose block scroll: ${JSON.stringify(state)}`);
		assert.ok(
			Math.abs((block.shortLineRowScrollLeft ?? 0) - block.rowScrollLeftMax) <= 1,
			`expected short Live Preview row not to drift from the block rows: ${JSON.stringify(state)}`,
		);
	}
}

function compactSyntaxText(text: string): string {
	return text.replace(/\s+/g, '');
}
