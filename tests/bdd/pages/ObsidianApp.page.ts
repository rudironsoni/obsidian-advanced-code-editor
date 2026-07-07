import { browser } from '@wdio/globals';
import { syntaxMatrixVerifier, type SyntaxMatrixMode, type SyntaxMatrixState } from './SyntaxMatrixVerifier.js';
import { syntaxSurfaceVerifier, type LivePreviewSyntaxState, type RenderState, type SourceModeSyntaxState } from './SyntaxSurfaceVerifier.js';
import { executeObsidian, waitForObsidianServiceHelper } from '../support/executeObsidian.js';
import { isWebDriverSessionGoneError } from '../support/wdioSession.js';

const pluginId = 'advanced-code-block';
const phonePortraitClass = 'shiki-wdio-phone-portrait';
const phonePortraitStyleId = 'shiki-wdio-phone-portrait-style';
let phonePortraitStyleApplied = false;

type PluginLoadState = {
	loaded: boolean;
	isMobile: boolean;
	version: string | null;
};

type RuntimeApp = {
	isMobile: boolean;
	plugins: {
		enabledPlugins: Set<string>;
		manifests: Record<string, { version?: string } | undefined>;
		plugins: Record<string, unknown>;
	};
	workspace: {
		leftSplit?: {
			collapse(): void;
			expand(): void;
		};
		trigger?(name: string): void;
	};
};

class ObsidianAppPage {
	async waitForPluginLoaded(): Promise<PluginLoadState> {
		await browser.waitUntil(async () => (await this.getPluginLoadState()).loaded, {
			timeoutMsg: `${pluginId} did not load`,
		});
		return this.getPluginLoadState();
	}

	async getPluginLoadState(): Promise<PluginLoadState> {
		return executeObsidian(({ app }, id): PluginLoadState => {
			const runtimeApp = app as unknown as RuntimeApp;
			const manifest = runtimeApp.plugins.manifests[id];
			return {
				loaded: runtimeApp.plugins.enabledPlugins.has(id) && runtimeApp.plugins.plugins[id] !== undefined,
				isMobile: runtimeApp.isMobile,
				version: manifest?.version ?? null,
			};
		}, pluginId);
	}

	async openFixtureInReadingMode(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'preview' }, active: true }, { history: false });
		}, path);
	}

	async openFixtureInLivePreview(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'source', source: false }, active: true }, { history: false });
		}, path);
	}

	async openFixtureInSourceMode(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'source', source: true }, active: true }, { history: false });
		}, path);
	}

	async waitForReadingRender(expectedText: string): Promise<RenderState> {
		return syntaxSurfaceVerifier.waitForReadingRender(expectedText);
	}

	async waitForLivePreviewStyledSource(expectedText: string): Promise<LivePreviewSyntaxState> {
		return syntaxSurfaceVerifier.waitForLivePreviewStyledSource(expectedText);
	}

	async waitForSourceModeShiki(expectedText: string): Promise<SourceModeSyntaxState> {
		return syntaxSurfaceVerifier.waitForSourceModeShiki(expectedText);
	}

	async waitForSyntaxLanguageMatrix(mode: SyntaxMatrixMode): Promise<SyntaxMatrixState> {
		return syntaxMatrixVerifier.waitForSyntaxLanguageMatrix(mode);
	}

	async getReadingRenderState(): Promise<RenderState> {
		return syntaxSurfaceVerifier.getReadingRenderState();
	}

	async getLivePreviewSyntaxState(): Promise<LivePreviewSyntaxState> {
		return syntaxSurfaceVerifier.getLivePreviewSyntaxState();
	}

	async getSourceModeSyntaxState(): Promise<SourceModeSyntaxState> {
		return syntaxSurfaceVerifier.getSourceModeSyntaxState();
	}

	async moveFocusAwayFromNote(): Promise<void> {
		await executeObsidian(() => {
			const root = document.querySelector<HTMLElement>('.markdown-source-view.mod-cm6, .markdown-preview-view');
			let target = document.getElementById('shiki-wdio-focus-away') as HTMLButtonElement | null;
			if (!target) {
				target = document.createElement('button');
				target.id = 'shiki-wdio-focus-away';
				target.textContent = 'focus';
				target.style.position = 'fixed';
				target.style.left = '0';
				target.style.bottom = '0';
				target.style.width = '1px';
				target.style.height = '1px';
				target.style.opacity = '0';
				document.body.appendChild(target);
			}
			target.focus();
			target.click();
			if (root?.contains(document.activeElement)) {
				throw new Error('Failed to move focus away from the note');
			}
		});
		await browser.pause(500);
	}

	async collapseAndExpandLeftSidebar(): Promise<void> {
		await executeObsidian(({ app }) => {
			const runtimeApp = app as unknown as RuntimeApp;
			runtimeApp.workspace.leftSplit?.collapse();
			runtimeApp.workspace.trigger?.('layout-change');
		});
		await browser.pause(250);
		await executeObsidian(({ app }) => {
			const runtimeApp = app as unknown as RuntimeApp;
			runtimeApp.workspace.leftSplit?.expand();
			runtimeApp.workspace.trigger?.('layout-change');
		});
		await browser.pause(500);
	}

	async expectMobileEmulation(): Promise<void> {
		await browser.waitUntil(async () => this.isMobileEmulationActive(), {
			timeout: 30000,
			timeoutMsg: 'Obsidian mobile emulation was not active. Run mobile scenarios with wdio.mobile.conf.mts.',
		});
		await waitForObsidianServiceHelper();
	}

	async resizeToPhonePortrait(): Promise<void> {
		await executeObsidian(
			(_, input) => {
				document.body.classList.add(input.className);
				document.getElementById(input.styleId)?.remove();
				const style = document.createElement('style');
				style.id = input.styleId;
				style.textContent = `
				body.${input.className} .workspace-leaf.mod-active .view-content {
					width: 430px !important;
					max-width: 430px !important;
					margin-inline: auto !important;
				}
				body.${input.className} .workspace-leaf.mod-active .markdown-source-view,
				body.${input.className} .workspace-leaf.mod-active .markdown-preview-view {
					width: 100% !important;
					max-width: 100% !important;
				}
			`;
				document.head.appendChild(style);
			},
			{ className: phonePortraitClass, styleId: phonePortraitStyleId },
		);
		phonePortraitStyleApplied = true;
	}

	async resetWindowSize(): Promise<void> {
		if (!phonePortraitStyleApplied) {
			return;
		}
		phonePortraitStyleApplied = false;
		await executeObsidian(
			(_, input) => {
				document.body.classList.remove(input.className);
				document.getElementById(input.styleId)?.remove();
			},
			{ className: phonePortraitClass, styleId: phonePortraitStyleId },
		);
	}

	async resetMobileEmulation(): Promise<void> {
		if (!(await this.canReadMobileEmulationState())) {
			return;
		}
	}

	private async isMobileEmulationActive(): Promise<boolean> {
		return browser.execute(() => {
			const runtimeWindow = window as unknown as { app?: { isMobile?: boolean } };
			return runtimeWindow.app?.isMobile === true;
		});
	}

	private async canReadMobileEmulationState(): Promise<boolean> {
		try {
			await this.isMobileEmulationActive();
			return true;
		} catch (error) {
			if (isWebDriverSessionGoneError(error)) {
				return false;
			}
			throw error;
		}
	}
}

export const obsidianApp = new ObsidianAppPage();
