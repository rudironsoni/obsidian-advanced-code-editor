import { describe, expect, test } from 'bun:test';

import { computeNextBetaVersion } from '../scripts/compute-beta-version';

describe('beta version calculation', () => {
	test('moves to the next patch beta when the package version is already released as stable', () => {
		const result = computeNextBetaVersion('0.9.0', ['0.9.0-beta.8', '0.9.0-beta.9', '0.9.0']);

		expect(result.packageStableTagExists).toBe(true);
		expect(result.packageBaseVersion).toBe('0.9.0');
		expect(result.betaBaseVersion).toBe('0.9.1');
		expect(result.latestBetaTag).toBeNull();
		expect(result.nextBetaVersion).toBe('0.9.1-beta.1');
	});

	test('increments an existing beta for the post-stable patch line', () => {
		const result = computeNextBetaVersion('0.9.0', ['0.9.0', '0.9.1-beta.1', '0.9.1-beta.2']);

		expect(result.betaBaseVersion).toBe('0.9.1');
		expect(result.latestBetaTag).toBe('0.9.1-beta.2');
		expect(result.nextBetaVersion).toBe('0.9.1-beta.3');
	});

	test('keeps the package base before that version has a stable release tag', () => {
		const result = computeNextBetaVersion('1.2.3', ['1.2.3-beta.4']);

		expect(result.packageStableTagExists).toBe(false);
		expect(result.betaBaseVersion).toBe('1.2.3');
		expect(result.latestBetaTag).toBe('1.2.3-beta.4');
		expect(result.nextBetaVersion).toBe('1.2.3-beta.5');
	});

	test('accepts v-prefixed release tags without emitting v-prefixed beta versions', () => {
		const result = computeNextBetaVersion('2.0.0', ['v2.0.0', 'v2.0.1-beta.1']);

		expect(result.betaBaseVersion).toBe('2.0.1');
		expect(result.latestBetaTag).toBe('v2.0.1-beta.1');
		expect(result.nextBetaVersion).toBe('2.0.1-beta.2');
	});
});
