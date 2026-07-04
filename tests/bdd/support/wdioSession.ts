const goneSessionPatterns = [
	'chrome not reachable',
	'disconnected',
	'invalid session id',
	'no such window',
	'session deleted',
	'target window already closed',
	'web view not found',
];

export function webdriverErrorMessage(error: unknown): string {
	return String(error instanceof Error ? error.message : error);
}

export function isWebDriverSessionGoneError(error: unknown): boolean {
	const message = webdriverErrorMessage(error).toLowerCase();
	return goneSessionPatterns.some(pattern => message.includes(pattern));
}
