import { describe, expect, test } from 'bun:test';
import { filterHighlightAllPlugin, type PrismWithFilterHighlightAll } from 'packages/obsidian/src/PrismPlugin';

function createPrismMock(): PrismWithFilterHighlightAll & { beforeAllElementsHighlight?: (env: { elements: Element[] }) => void } {
	const prism = {
		languages: { ts: {}, js: {} },
		plugins: {},
		util: {
			currentScript: () => null,
			getLanguage: (element: Element): string => element.getAttribute('data-language') ?? '',
		},
		hooks: {
			add: (_name: 'before-all-elements-highlight', callback: (env: { elements: Element[] }) => void): void => {
				prism.beforeAllElementsHighlight = callback;
			},
		},
	} as unknown as PrismWithFilterHighlightAll & { beforeAllElementsHighlight?: (env: { elements: Element[] }) => void };

	return prism;
}

describe('Prism filterHighlightAll plugin', () => {
	test('reject selector removes matching elements from Prism highlightAll', () => {
		const prism = createPrismMock();
		const plugin = filterHighlightAllPlugin(prism)!;
		const keep = document.createElement('code');
		const reject = document.createElement('code');
		const wrapper = document.createElement('div');
		wrapper.className = 'expressive-code';
		document.body.append(keep, wrapper);
		wrapper.append(reject);

		plugin.reject.addSelector('div.expressive-code pre code, div.expressive-code code');
		const env = { elements: [keep, reject] };
		prism.beforeAllElementsHighlight!(env);

		expect(env.elements).toEqual([keep]);
	});

	test('filterKnown removes unknown languages when enabled', () => {
		const prism = createPrismMock();
		const plugin = filterHighlightAllPlugin(prism)!;
		plugin.filterKnown = true;
		const known = document.createElement('code');
		const unknown = document.createElement('code');
		known.setAttribute('data-language', 'ts');
		unknown.setAttribute('data-language', 'unknown');

		const env = { elements: [known, unknown] };
		prism.beforeAllElementsHighlight!(env);

		expect(env.elements).toEqual([known]);
	});
});
