import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const artifactDir = path.resolve('tests/runtime-session/wdio-artifacts');

export function sanitizeArtifactName(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'scenario'
	);
}

export function writeJsonArtifact(name: string, payload: unknown): string {
	mkdirSync(artifactDir, { recursive: true });
	const filePath = path.join(artifactDir, `${sanitizeArtifactName(name)}.json`);
	writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	return filePath;
}
