import { browser } from '@wdio/globals';
import { syntaxMatrixVerifier, type SyntaxMatrixMode, type SyntaxMatrixState } from './SyntaxMatrixVerifier.js';
import {
	syntaxSurfaceVerifier,
	type CopyControlMode,
	type CopyControlState,
	type LivePreviewFenceCursorState,
	type LivePreviewSyntaxState,
	type MetadataParityMode,
	type MetadataParityState,
	type RenderState,
	type SourceModeSyntaxState,
	type ThemeBackgroundMode,
	type ThemeBackgroundState,
} from './SyntaxSurfaceVerifier.js';
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

type ThemeSettingsConfidenceState = {
	dark: {
		configuredTheme: string;
		effectiveTheme: string;
		text: string;
	};
	light: {
		configuredTheme: string;
		effectiveTheme: string;
		text: string;
	};
	validation: {
		state: string;
		loadableThemeCount: number;
		jsonFileCount: number;
		text: string;
	};
	isMobile: boolean;
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
			const runtimeApp = app as { setting?: { close?: () => void } };
			runtimeApp.setting?.close?.();
			document.querySelector<HTMLElement>('.modal-container .modal-close-button, .modal-close-button')?.click();
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'preview' }, active: true }, { history: false });
		}, path);
	}

	async openFixtureInLivePreview(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const runtimeApp = app as { setting?: { close?: () => void } };
			runtimeApp.setting?.close?.();
			document.querySelector<HTMLElement>('.modal-container .modal-close-button, .modal-close-button')?.click();
			const file = app.vault.getAbstractFileByPath(notePath);
			if (!(file instanceof obsidian.TFile)) throw new Error(`Fixture not found: ${notePath}`);

			const leaf = app.workspace.getLeaf(true);
			await leaf.openFile(file, { active: true });
			await leaf.setViewState({ type: 'markdown', state: { file: notePath, mode: 'source', source: false }, active: true }, { history: false });
		}, path);
	}

	async openFixtureInSourceMode(path: string): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, notePath) => {
			const runtimeApp = app as { setting?: { close?: () => void } };
			runtimeApp.setting?.close?.();
			document.querySelector<HTMLElement>('.modal-container .modal-close-button, .modal-close-button')?.click();
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

	async getLivePreviewFenceCursorState(): Promise<LivePreviewFenceCursorState> {
		return syntaxSurfaceVerifier.getLivePreviewFenceCursorState();
	}

	async getSourceModeSyntaxState(): Promise<SourceModeSyntaxState> {
		return syntaxSurfaceVerifier.getSourceModeSyntaxState();
	}

	async waitForThemeBackground(mode: ThemeBackgroundMode): Promise<ThemeBackgroundState> {
		return syntaxSurfaceVerifier.waitForThemeBackground(mode);
	}

	async waitForMetadataParity(mode: MetadataParityMode): Promise<MetadataParityState> {
		return syntaxSurfaceVerifier.waitForMetadataParity(mode);
	}

	async applyCodeBlockSettings(input: { wrapLines: boolean; showLineNumbers: boolean }): Promise<void> {
		await executeObsidian(
			async ({ app }, id, settings) => {
				const runtimeApp = app as unknown as RuntimeApp;
				const plugin = runtimeApp.plugins.plugins[id] as
					| {
							settings?: { wrapLines: boolean; showLineNumbers: boolean };
							saveSettingsAndReloadHighlighter?: () => Promise<void>;
					  }
					| undefined;
				if (!plugin?.settings || !plugin.saveSettingsAndReloadHighlighter) {
					throw new Error('Advanced Code Editor plugin settings were not available');
				}
				plugin.settings.wrapLines = settings.wrapLines;
				plugin.settings.showLineNumbers = settings.showLineNumbers;
				await plugin.saveSettingsAndReloadHighlighter();
			},
			pluginId,
			input,
		);
	}

	async verifyCopyControl(mode: CopyControlMode): Promise<CopyControlState> {
		return syntaxSurfaceVerifier.verifyCopyControl(mode);
	}

	async prepareThemeConfidenceFixture(): Promise<void> {
		await executeObsidian(async ({ app, obsidian }, id) => {
			const folder = 'customThemes';
			const themePath = `${folder}/Wdio Theme-color-theme.json`;
			if (!(await app.vault.adapter.exists(folder))) {
				await app.vault.createFolder(folder);
			}
			const themeJson = JSON.stringify(
				{
					name: 'WDIO Theme',
					type: 'dark',
					colors: {},
					tokenColors: [{ scope: 'keyword', settings: { foreground: '#ff0000' } }],
				},
				null,
				2,
			);
			const existing = app.vault.getAbstractFileByPath(themePath);
			if (existing instanceof obsidian.TFile) {
				await app.vault.modify(existing, themeJson);
			} else {
				await app.vault.create(themePath, themeJson);
			}

			const runtimeApp = app as unknown as RuntimeApp;
			const plugin = runtimeApp.plugins.plugins[id] as
				| {
						settings?: { darkTheme: string; lightTheme: string; customThemeFolder: string };
						saveSettingsAndReloadHighlighter?: () => Promise<void>;
				  }
				| undefined;
			if (!plugin?.settings || !plugin.saveSettingsAndReloadHighlighter) {
				throw new Error('Advanced Code Editor plugin settings were not available');
			}
			plugin.settings.darkTheme = 'obsidian-theme';
			plugin.settings.lightTheme = 'obsidian-theme';
			plugin.settings.customThemeFolder = folder;
			await plugin.saveSettingsAndReloadHighlighter();
		}, pluginId);
	}

	async waitForThemeSettingsConfidence(): Promise<ThemeSettingsConfidenceState> {
		await browser.waitUntil(
			async () => {
				const state = await this.getThemeSettingsConfidence();
				return (
					state.dark.effectiveTheme === 'github-dark' &&
					state.light.effectiveTheme === 'github-light' &&
					state.validation.state === 'valid' &&
					state.validation.loadableThemeCount >= 1
				);
			},
			{ timeout: 30000, timeoutMsg: 'Theme confidence settings did not show expected confirmations' },
		);
		const state = await this.getThemeSettingsConfidence();
		await executeObsidian(({ app }) => {
			const runtimeApp = app as { setting?: { close?: () => void } };
			runtimeApp.setting?.close?.();
			document.querySelector<HTMLElement>('.modal-container .modal-close-button, .modal-close-button')?.click();
		});
		return state;
	}

	private async getThemeSettingsConfidence(): Promise<ThemeSettingsConfidenceState> {
		return executeObsidian(async ({ app }, id): Promise<ThemeSettingsConfidenceState> => {
			const runtimeApp = app as unknown as RuntimeApp & {
				setting?: {
					open(): void;
					openTabById(id: string): void;
				};
			};
			runtimeApp.setting?.open();
			runtimeApp.setting?.openTabById(id);
			await new Promise(resolve => window.setTimeout(resolve, 150));

			const readTheme = (mode: 'dark' | 'light') => {
				const el = document.querySelector<HTMLElement>(`.shiki-theme-confidence[data-shiki-theme-mode="${mode}"]`);
				return {
					configuredTheme: el?.dataset.shikiConfiguredTheme ?? '',
					effectiveTheme: el?.dataset.shikiEffectiveTheme ?? '',
					text: el?.textContent ?? '',
				};
			};
			const validation = document.querySelector<HTMLElement>('.shiki-custom-theme-validation');

			return {
				dark: readTheme('dark'),
				light: readTheme('light'),
				validation: {
					state: validation?.dataset.shikiValidationState ?? '',
					loadableThemeCount: Number(validation?.dataset.shikiLoadableThemeCount ?? 0),
					jsonFileCount: Number(validation?.dataset.shikiJsonFileCount ?? 0),
					text: validation?.textContent ?? '',
				},
				isMobile: runtimeApp.isMobile,
			};
		}, pluginId);
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
