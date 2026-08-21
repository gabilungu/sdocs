/**
 * `[NOTES]`, `[TODO]` and `[PROSE]` — the blocks that replaced the notes
 * attribute in 0.0.139. The last two assertions are the ones that matter most:
 * a nested block has to come *out* of an example's markup, or it would be
 * staged as Svelte and fail to compile.
 */

import { it, expect } from 'vitest';
import { parseSdoc, type ShowcaseEntity } from '../../src/lib/language/parser.js';

const SRC = [
	'<script>',
	"\timport B from './B.svelte';",
	'</script>',
	'',
	'[SHOWCASE title="Forms / Button"]',
	'',
	'\t[NOTES]',
	'\t\t- bug: Focus ring lands 1px off in Safari.',
	'\t\t- ready: Audited for contrast.',
	'\t\t- A plain remark.',
	'\t[/NOTES]',
	'',
	'\t[TODO]',
	'\t\t- [ ] Add a dark-mode example',
	'\t\t\t- [x] check contrast',
	'\t\t\t- [ ] check focus ring',
	'\t\t- [x] Document the size prop',
	'\t[/TODO]',
	'',
	'\t[COMPONENT component={B}]',
	'\t\t<B {...args} />',
	'\t[/COMPONENT]',
	'',
	'\t[EXAMPLE title="Ghost"]',
	'\t\t[NOTES]',
	'\t\t\t- wip: Not final.',
	'\t\t[/NOTES]',
	'\t\t<B variant="ghost" />',
	'\t[/EXAMPLE]',
	'',
	'[/SHOWCASE]',
	'',
].join('\n');

it('parses the new blocks', () => {
	const doc = parseSdoc(SRC);
	expect(doc.diagnostics).toEqual([]);
	const sc = doc.entities[0] as ShowcaseEntity;
	expect(sc.notes).toEqual([
		{ note: 'Focus ring lands 1px off in Safari.', type: 'bug' },
		{ note: 'Audited for contrast.', type: 'ready' },
		{ note: 'A plain remark.', type: null },
	]);
	expect(sc.todos).toEqual([
		{ text: 'Add a dark-mode example', done: false, children: [
			{ text: 'check contrast', done: true, children: [] },
			{ text: 'check focus ring', done: false, children: [] },
		]},
		{ text: 'Document the size prop', done: true, children: [] },
	]);
	expect(sc.examples[0].notes).toEqual([{ note: 'Not final.', type: 'wip' }]);
	// The nested block must not remain in what gets staged.
	expect(sc.examples[0].markup).not.toContain('[NOTES]');
	expect(sc.examples[0].markup).toContain('<B variant="ghost" />');
});
