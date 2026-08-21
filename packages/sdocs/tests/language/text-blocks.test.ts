/**
 * `[NOTES]`, `[TODO]` and `[PROSE]` — the blocks that replaced the notes
 * attribute in 0.0.139. The last two assertions are the ones that matter most:
 * a nested block has to come *out* of an example's markup, or it would be
 * staged as Svelte and fail to compile.
 */

import { describe, it, expect } from 'vitest';
import { parseSdoc, type ShowcaseEntity } from '../../src/lib/language/parser.js';
import {
	planEntitySnippets,
	planIframeSnippets,
} from '../../src/lib/server/doc-model.js';

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

/**
 * `[PROSE]` is the block that lets an entity say something between its blocks
 * rather than only above them. A [SHOWCASE]'s prose compiles like a [DOC]
 * body; an [EXAMPLE]'s is markdown, and a [DOC]'s is a mistake — its body is
 * already prose.
 */
describe('[PROSE]', () => {
	it('collects a showcase’s blocks in source order', () => {
		const doc = parseSdoc(
			[
				'[SHOWCASE title="Display / Badge"]',
				'',
				'\t[PROSE]',
				'\t\tFirst, some **context**.',
				'\t[/PROSE]',
				'',
				'\t[COMPONENT component={Badge}]',
				'\t\t<Badge />',
				'\t[/COMPONENT]',
				'',
				'\t[PROSE]',
				'\t\tAnd a closing word.',
				'\t[/PROSE]',
				'',
				'[/SHOWCASE]',
			].join('\n'),
		);
		const entity = doc.entities[0];
		expect(entity.kind).toBe('SHOWCASE');
		expect(entity.kind === 'SHOWCASE' && entity.prose).toEqual([
			'First, some **context**.',
			'And a closing word.',
		]);
		expect(doc.diagnostics).toEqual([]);
	});

	it('gives each showcase prose block its own snippet, ahead of the previews', () => {
		const doc = parseSdoc(
			[
				'[SHOWCASE title="Display / Badge"]',
				'',
				'\t[PROSE]',
				'\t\tContext.',
				'\t[/PROSE]',
				'',
				'\t[COMPONENT component={Badge}]',
				'\t\t<Badge />',
				'\t[/COMPONENT]',
				'',
				'[/SHOWCASE]',
			].join('\n'),
		);
		const planned = planEntitySnippets(doc.entities[0]);
		expect(planned.map((s) => [s.role, s.slug])).toEqual([
			['prose', 'prose-1'],
			['preview', 'badge'],
		]);
		// Prose renders natively in the Explorer — it is never an iframe page.
		expect(planIframeSnippets(doc.entities[0]).map((s) => s.slug)).toEqual(['badge']);
	});

	it('carries an example’s prose on its snippet', () => {
		const doc = parseSdoc(
			[
				'[SHOWCASE title="Display / Badge"]',
				'',
				'\t[EXAMPLE title="Plain"]',
				'\t\t[PROSE]',
				'\t\t\tWhy this one matters.',
				'\t\t[/PROSE]',
				'\t\t<Badge />',
				'\t[/EXAMPLE]',
				'',
				'[/SHOWCASE]',
			].join('\n'),
		);
		const example = planEntitySnippets(doc.entities[0]).find((s) => s.role === 'example');
		expect(example?.prose).toBe('Why this one matters.');
		// And it is lifted out of the body, so it is never staged as markup.
		expect(example?.body).not.toContain('Why this one matters');
	});

	it('rejects [PROSE] inside a [DOC]', () => {
		const doc = parseSdoc(
			['[DOC title="Guides / Intro"]', '', '\t[PROSE]', '\t\tHi.', '\t[/PROSE]', '', '[/DOC]'].join(
				'\n',
			),
		);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['prose-in-doc']);
	});
});

/**
 * `[COMPONENTS]` exists so a showcase's tabs are one item in the flow — which
 * is what lets prose sit before or after them and mean something. It holds
 * component blocks and nothing else, and a showcase has at most one.
 */
describe('[COMPONENTS]', () => {
	const wrap = (body: string) => parseSdoc(`[SHOWCASE title="Nav / Tabs"]\n${body}\n[/SHOWCASE]\n`);
	const component = (name: string) =>
		`\t\t[COMPONENT component={${name}}]\n\t\t\t<${name} />\n\t\t[/COMPONENT]`;

	it('puts every component in one tab strip, where the first was written', () => {
		const doc = wrap(
			[
				'\t[PROSE]',
				'\t\tBefore.',
				'\t[/PROSE]',
				'\t[COMPONENTS]',
				component('Tabs'),
				component('Tab'),
				'\t[/COMPONENTS]',
				'\t[PROSE]',
				'\t\tAfter.',
				'\t[/PROSE]',
				'\t[EXAMPLE title="Vertical"]',
				'\t\t<Tabs vertical />',
				'\t[/EXAMPLE]',
			].join('\n'),
		);
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as ShowcaseEntity;
		expect(entity.flow).toEqual([
			{ kind: 'prose', index: 0 },
			{ kind: 'components', indices: [0, 1] },
			{ kind: 'prose', index: 1 },
			{ kind: 'example', index: 0 },
		]);
	});

	it('leaves a lone bare [COMPONENT] alone', () => {
		const doc = wrap(component('Tabs'));
		expect(doc.diagnostics).toEqual([]);
		expect((doc.entities[0] as ShowcaseEntity).flow).toEqual([
			{ kind: 'components', indices: [0] },
		]);
	});

	it('refuses two bare components, and says what to do about it', () => {
		const doc = wrap([component('Tabs'), component('Tab')].join('\n'));
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['components-need-container']);
		expect(doc.diagnostics[0].message).toContain('[COMPONENTS]');
	});

	it('refuses a second container', () => {
		const doc = wrap(
			[
				'\t[COMPONENTS]',
				component('Tabs'),
				'\t[/COMPONENTS]',
				'\t[COMPONENTS]',
				component('Tab'),
				'\t[/COMPONENTS]',
			].join('\n'),
		);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['one-components-container']);
	});

	it('refuses anything but a component inside it', () => {
		const doc = wrap(
			['\t[COMPONENTS]', component('Tabs'), '\t\t[PROSE]', '\t\t\tHi.', '\t\t[/PROSE]', '\t[/COMPONENTS]'].join(
				'\n',
			),
		);
		expect(doc.diagnostics.map((d) => d.code)).toEqual(['block-in-components']);
	});

	it('reports an unclosed container', () => {
		const doc = wrap(['\t[COMPONENTS]', component('Tabs')].join('\n'));
		expect(doc.diagnostics.map((d) => d.code)).toContain('unclosed-block');
	});
});
