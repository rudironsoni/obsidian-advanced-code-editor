import { After } from '@wdio/cucumber-framework';
import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { horizontalScrollPage, type HorizontalScrollMode, type HorizontalScrollState } from '../pages/HorizontalScroll.page.js';
import { obsidianApp } from '../pages/ObsidianApp.page.js';
import { artifactDir, sanitizeArtifactName, writeJsonArtifact } from './artifacts.js';
import { isObsidianServiceHelperAvailable } from './executeObsidian.js';
import { isWebDriverSessionGoneError, webdriverErrorMessage } from './wdioSession.js';

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
			const canUseBrowser = await saveFailureScreenshot(scenarioName);
			if (canUseBrowser && isHorizontalScrollScenario && (await isObsidianServiceHelperAvailable())) {
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
		await runCleanup('reset-window-size', () => obsidianApp.resetWindowSize());
		await runCleanup('reset-mobile-emulation', () => obsidianApp.resetMobileEmulation());
		if (isHorizontalScrollScenario && (await isObsidianServiceHelperAvailable())) {
			await runCleanup('reset-horizontal-scroll-fixtures', () => horizontalScrollPage.resetFixtureNotes());
		}
	}
});

async function saveFailureScreenshot(scenarioName: string): Promise<boolean> {
	try {
		await browser.saveScreenshot(path.join(artifactDir, `${scenarioName}.png`));
		return true;
	} catch (error) {
		writeJsonArtifact(`${scenarioName}-screenshot-error`, {
			message: webdriverErrorMessage(error),
			sessionGone: isWebDriverSessionGoneError(error),
		});
		return !isWebDriverSessionGoneError(error);
	}
}

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
	try {
		await browser.pause(pauseMs);
	} catch (error) {
		writeJsonArtifact(`${scenarioName}-debug-pause-error`, {
			message: webdriverErrorMessage(error),
			sessionGone: isWebDriverSessionGoneError(error),
		});
	}
}

async function runCleanup(name: string, cleanup: () => Promise<void>): Promise<void> {
	try {
		await cleanup();
	} catch (error) {
		writeJsonArtifact(`${name}-cleanup-error`, {
			message: webdriverErrorMessage(error),
			sessionGone: isWebDriverSessionGoneError(error),
		});
	}
}
