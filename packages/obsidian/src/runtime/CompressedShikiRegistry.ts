import { decompress } from 'fzstd';
import type { LanguageRegistration, ThemeRegistration } from 'shiki';

interface ShikiAssets {
	languages: Record<string, LanguageRegistration | LanguageRegistration[]>;
	themes: Record<string, ThemeRegistration>;
}

function decodeBase64(payload: string): Uint8Array {
	const binary = atob(payload);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

export function decodeCompressedShikiAsset<T>(payload: string): T {
	return JSON.parse(new TextDecoder().decode(decompress(decodeBase64(payload)))) as T;
}

class CompressedShikiRegistry {
	private assets: Promise<ShikiAssets> | undefined;
	private readonly languageRequests = new Map<string, Promise<LanguageRegistration[]>>();
	private readonly themeRequests = new Map<string, Promise<ThemeRegistration>>();

	loadLanguage(id: string): Promise<LanguageRegistration[]> {
		const existing = this.languageRequests.get(id);
		if (existing) return existing;
		const request = this.getAssets().then(assets => {
			const registration = assets.languages[id];
			if (!registration) throw new Error(`Unknown Shiki language: ${id}`);
			return Array.isArray(registration) ? registration : [registration];
		});
		this.languageRequests.set(id, request);
		request.catch(() => this.languageRequests.delete(id));
		return request;
	}

	loadTheme(id: string): Promise<ThemeRegistration> {
		const existing = this.themeRequests.get(id);
		if (existing) return existing;
		const request = this.getAssets().then(assets => {
			const theme = assets.themes[id];
			if (!theme) throw new Error(`Unknown Shiki theme: ${id}`);
			return theme;
		});
		this.themeRequests.set(id, request);
		request.catch(() => this.themeRequests.delete(id));
		return request;
	}

	private getAssets(): Promise<ShikiAssets> {
		this.assets ??= import('virtual:compressed-shiki-assets').then(module => decodeCompressedShikiAsset<ShikiAssets>(module.compressedShikiAssets));
		return this.assets;
	}
}

export const compressedShikiRegistry = new CompressedShikiRegistry();
