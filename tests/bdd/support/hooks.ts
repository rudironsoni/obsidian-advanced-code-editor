import { After } from '@wdio/cucumber-framework';
import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { obsidianApp } from '../pages/ObsidianApp.page.js';

const artifactDir = path.resolve('tests/runtime-session/wdio-artifacts');

type ScenarioResult = {
	pickle?: {
		name?: string;
		tags?: readonly { name?: string }[];
	};
	result?: {
		status?: string;
	};
};

After(async function (scenario: ScenarioResult) {
	if (scenario.result?.status === 'PASSED') return;

	mkdirSync(artifactDir, { recursive: true });
	const scenarioName = scenario.pickle?.name ?? 'scenario';
	const fileName =
		scenarioName
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'scenario';
	await browser.saveScreenshot(path.join(artifactDir, `${fileName}.png`));
});

After(async function (scenario: ScenarioResult) {
	const isMobileScenario = scenario.pickle?.tags?.some(tag => tag.name === '@mobile') ?? false;
	if (isMobileScenario) {
		await obsidianApp.resetMobileEmulation();
	}
});
