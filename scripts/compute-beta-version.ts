import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface VersionParts {
	major: number;
	minor: number;
	patch: number;
}

interface BetaTag extends VersionParts {
	tag: string;
	beta: number;
}

export interface BetaVersionResult {
	packageBaseVersion: string;
	betaBaseVersion: string;
	packageStableTagExists: boolean;
	latestBetaTag: string | null;
	nextBetaVersion: string;
}

function parseBaseVersion(version: string): VersionParts {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(version);
	if (!match) {
		throw new Error(`Package version is not SemVer: ${version}`);
	}

	return {
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
	};
}

function parseStableTag(tag: string): VersionParts | null {
	const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag);
	if (!match) return null;

	return {
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
	};
}

function parseBetaTag(tag: string): BetaTag | null {
	const match = /^v?(\d+)\.(\d+)\.(\d+)-beta\.(\d+)$/.exec(tag);
	if (!match) return null;

	return {
		tag,
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
		beta: Number.parseInt(match[4], 10),
	};
}

function formatVersion(version: VersionParts): string {
	return `${version.major}.${version.minor}.${version.patch}`;
}

function matchesBase(tag: VersionParts, base: VersionParts): boolean {
	return tag.major === base.major && tag.minor === base.minor && tag.patch === base.patch;
}

export function computeNextBetaVersion(packageVersion: string, tags: readonly string[]): BetaVersionResult {
	const packageBase = parseBaseVersion(packageVersion);
	const packageStableTagExists = tags.map(parseStableTag).some(tag => tag !== null && matchesBase(tag, packageBase));
	const betaBase = packageStableTagExists ? { ...packageBase, patch: packageBase.patch + 1 } : packageBase;
	const betaTags = tags
		.map(parseBetaTag)
		.filter((tag): tag is BetaTag => tag !== null && matchesBase(tag, betaBase))
		.sort((a, b) => b.beta - a.beta);
	const latestBetaTag = betaTags[0] ?? null;
	const betaBaseVersion = formatVersion(betaBase);

	return {
		packageBaseVersion: formatVersion(packageBase),
		betaBaseVersion,
		packageStableTagExists,
		latestBetaTag: latestBetaTag?.tag ?? null,
		nextBetaVersion: `${betaBaseVersion}-beta.${latestBetaTag ? latestBetaTag.beta + 1 : 1}`,
	};
}

function readGitTags(): string[] {
	return execSync('git tag --list', { encoding: 'utf8' })
		.split(/\r?\n/)
		.map(tag => tag.trim())
		.filter(Boolean);
}

function readPackageVersion(): string {
	const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { version?: unknown };
	if (typeof packageJson.version !== 'string') {
		throw new Error('package.json version must be a string');
	}

	return packageJson.version;
}

function run(): void {
	const result = computeNextBetaVersion(readPackageVersion(), readGitTags());
	console.log(`Package base version: ${result.packageBaseVersion}`);
	console.log(`Package stable tag exists: ${result.packageStableTagExists ? 'yes' : 'no'}`);
	console.log(`Beta base version: ${result.betaBaseVersion}`);
	console.log(`Latest beta tag for base: ${result.latestBetaTag ?? '(none)'}`);
	console.log(`Next beta tag: ${result.nextBetaVersion}`);

	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `new_tag=${result.nextBetaVersion}\n`);
	} else {
		console.log(`new_tag=${result.nextBetaVersion}`);
	}
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	run();
}
