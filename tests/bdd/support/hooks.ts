import { After } from '@wdio/cucumber-framework';
import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { horizontalScrollPage, type HorizontalScrollMode, type HorizontalScrollState } from '../pages/HorizontalScroll.page.js';
import { obsidianApp } from '../pages/ObsidianApp.page.js';
import { artifactDir, sanitizeArtifactName, writeJsonArtifact } from './artifacts.js';

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
	const scenarioName = sanitizeArtifactName(scenario.pickle?.name ?? 'scenario');
	const tags = scenario.pickle?.tags ?? [];
	const isHorizontalScrollScenario = tags.some(tag => tag.name === '@horizontal-scroll');
	const didFail = scenario.result?.status !== 'PASSED';

	try {
		if (didFail) {
			mkdirSync(artifactDir, { recursive: true });
			await browser.saveScreenshot(path.join(artifactDir, `${scenarioName}.png`));
			if (isHorizontalScrollScenario) {
				const states = await collectFailureStates();
				writeJsonArtifact(`${scenarioName}-scroll-state`, {
					scenario: scenario.pickle?.name ?? 'scenario',
					status: scenario.result?.status ?? 'UNKNOWN',
					states,
				});
			}
		}
		await pauseForScrollDebug(isHorizontalScrollScenario, scenarioName);
	} finally {
		await obsidianApp.resetMobileEmulation();
		if (isHorizontalScrollScenario) {
			await horizontalScrollPage.resetFixtureNotes();
		}
	}
});

async function collectFailureStates(): Promise<HorizontalScrollState[]> {
	const states: HorizontalScrollState[] = [];
	const modes: HorizontalScrollMode[] = ['reading', 'live-preview', 'source'];
	for (const mode of modes) {
		try {
			states.push(await horizontalScrollPage.collectScrollState(mode, 'failure'));
		} catch (error) {
			writeJsonArtifact(`horizontal-scroll-${mode}-failure-collection-error`, {
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return states;
}

async function pauseForScrollDebug(isHorizontalScrollScenario: boolean, scenarioName: string): Promise<void> {
	if (!isHorizontalScrollScenario) {
		return;
	}
	const pauseMs = Number.parseInt(env.WDIO_OBSIDIAN_DEBUG_PAUSE_MS ?? '', 10);
	if (!Number.isFinite(pauseMs) || pauseMs <= 0) {
		return;
	}
	writeJsonArtifact(`${scenarioName}-debug-pause`, {
		pauseMs,
		message: 'Paused before cleanup so the sandboxed WDIO Obsidian window can be inspected.',
	});
	await browser.pause(pauseMs);
}
