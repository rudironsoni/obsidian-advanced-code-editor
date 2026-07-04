import { describe, expect, test } from 'bun:test';
import { isWebDriverSessionGoneError, webdriverErrorMessage } from './bdd/support/wdioSession';

describe('WDIO session error handling', () => {
	test('recognizes closed Obsidian renderer errors as dead sessions', () => {
		const error = new Error('WebDriverError: no such window: target window already closed from unknown error: web view not found');

		expect(isWebDriverSessionGoneError(error)).toBe(true);
	});

	test('recognizes invalid or disconnected WebDriver sessions', () => {
		expect(isWebDriverSessionGoneError('invalid session id: session deleted because of page crash')).toBe(true);
		expect(isWebDriverSessionGoneError('chrome not reachable: disconnected')).toBe(true);
	});

	test('does not classify missing Obsidian helper during startup as a dead session', () => {
		const error = new Error('wdioObsidianService is not a function');

		expect(isWebDriverSessionGoneError(error)).toBe(false);
		expect(webdriverErrorMessage(error)).toContain('wdioObsidianService');
	});
});
