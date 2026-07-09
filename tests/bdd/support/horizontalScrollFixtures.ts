const stressLine = 'abcdefghijklmnopqrstuvwxyz0123456789_'.repeat(8);
const stressLines = Array.from(
	{ length: 120 },
	(_, index) => `const stressLine${String(index).padStart(3, '0')} = "${stressLine}${String(index).padStart(3, '0')}";`,
).join('\n');

export const horizontalScrollFixtureNotes: Record<string, string> = {
	'Horizontal scroll single block.md': `# Horizontal scroll single block

This fixture verifies that one overflowing fenced code block owns horizontal scroll.

\`\`\`ts title="Block owned horizontal scroll"
const horizontalScrollAnchor = "alpha-0123456789-beta-0123456789-gamma-0123456789-delta-0123456789-epsilon-0123456789-zeta-0123456789-eta-0123456789-theta-0123456789";
const shortLineMustScrollWithBlock = 1;
const exactEditTarget = "HORIZONTAL_SCROLL_MARKER: keep this marker on a very long line so the editor must scroll horizontally before the edit lands in the intended place";
const followupValue = horizontalScrollAnchor + exactEditTarget + "omega-0123456789-omega-0123456789-omega-0123456789";
\`\`\`

After the block.
`,
	'Horizontal scroll gutter blank lines.md': `# Horizontal scroll gutter blank lines

This fixture verifies that Live Preview paints the code block gutter continuously across blank code lines.

\`\`\`py title="PyCharm Django Console fixes"
import builtins, os, runpy, sys
print('Python %s on %s' % (sys.version, sys.platform))
import django

print('Django %s' % django.get_version())

sys.path.extend(['/app/src', '/opt/.pycharm_helpers/pycharm'])
os.chdir('/app/src')

if 'setup' in dir(django): django.setup()

sys.argv = [
    'manage.py',
    'shell_plus',
]
runpy.run_path('/app/src' + '/manage.py', run_name='__main__', init_globals={'console_namespace_marker': 'alpha-0123456789-beta-0123456789-gamma-0123456789-delta-0123456789'})
\`\`\`

After the block.
`,
	'Horizontal scroll multi block.md': `# Horizontal scroll multi block

This fixture verifies independent horizontal scroll positions for neighboring fenced code blocks.

\`\`\`ts title="First independent block"
const firstBlockAnchor = "first-0123456789-first-0123456789-first-0123456789-first-0123456789-first-0123456789-first-0123456789-first-0123456789";
const firstBlockTail = firstBlockAnchor + "FIRST_BLOCK_SCROLL_TARGET";
\`\`\`

Text between the blocks keeps the note readable.

\`\`\`ts title="Second independent block"
const secondBlockAnchor = "second-abcdefghijklmnopqrstuvwxyz-second-abcdefghijklmnopqrstuvwxyz-second-abcdefghijklmnopqrstuvwxyz-second-abcdefghijklmnopqrstuvwxyz";
const secondBlockTail = secondBlockAnchor + "SECOND_BLOCK_SCROLL_TARGET";
\`\`\`
`,
	'Horizontal scroll wrapped block.md': `# Horizontal scroll wrapped block

This fixture verifies that wrap-on code blocks do not require block horizontal scroll.

\`\`\`ts title="Wrapped block"
const wrappedHorizontalScrollAnchor = "wrap-0123456789-wrap-0123456789-wrap-0123456789-wrap-0123456789-wrap-0123456789-wrap-0123456789-wrap-0123456789-wrap-0123456789";
const wrappedFollowupValue = wrappedHorizontalScrollAnchor + "WRAP_ON_SCROLL_TARGET";
\`\`\`
`,
	'Horizontal scroll stress block.md': `# Horizontal scroll stress block

This fixture verifies that Live Preview horizontal scroll remains responsive under repeated wheel input.

\`\`\`ts title="Live Preview scroll performance"
${stressLines}
\`\`\`

After the stress block.
`,
};
