export function findReadingCodeElements(root: HTMLElement): Set<HTMLElement> {
	const codeElements = new Set<HTMLElement>();
	const closestPre = root.matches('pre') ? root : root.closest<HTMLElement>('pre');
	const closestCode = closestPre?.querySelector<HTMLElement>(':scope > code');
	if (closestCode) {
		codeElements.add(closestCode);
	}
	for (const codeElement of root.querySelectorAll<HTMLElement>('pre > code')) {
		codeElements.add(codeElement);
	}
	return codeElements;
}
