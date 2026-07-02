import { Given, Then, When } from '@wdio/cucumber-framework';
import { strict as assert } from 'node:assert';
import { obsidianApp } from '../pages/ObsidianApp.page.js';

let lastExpectedRenderText = '';

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
