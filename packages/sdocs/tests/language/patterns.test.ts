/**
 * `[PATTERNS]` — a composition documented as one thing, with its states.
 *
 * A `[SHOWCASE]` with the prop half switched off: the same blocks, the same
 * flow, the same stages, no `[COMPONENT]`. It shipped first as a body-only
 * entity — one composition, no blocks — which turned out to be too little in
 * use: a notifications system with one state is a screenshot, and the body had
 * neither the resize handles nor the code panel's overflow handling that the
 * showcase examples have had all along. Sharing the showcase path fixed both
 * by construction.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSdoc } from '../../src/lib/language/parser.js';
import { scanSdoc, ENTITY_KINDS } from '../../src/lib/language/scanner.js';
import { buildSiteMap } from '../../src/lib/server/site-map.js';
import { loadConfig } from '../../src/lib/server/config.js';

const SRC = `<script lang="ts">
	import Button from './Button.svelte';
</script>

[PATTERNS title="Patterns / Burger button" description="A Button and an icon that folds."]

	[EXAMPLE title="Icon only"]
		<Button aria-label="Menu" />
	[/EXAMPLE]

	[PROSE]
		With a label it reads better for sighted users.
	[/PROSE]

	[EXAMPLE title="With label"]
		<Button>Menu</Button>
	[/EXAMPLE]

	[NOTES]
		- a11y: The trigger owns aria-expanded.
	[/NOTES]

[/PATTERNS]
`;

describe('the entity', () => {
	it('is one of the kinds the scanner knows', () => {
		expect(ENTITY_KINDS).toContain('PATTERNS');
		expect(scanSdoc(SRC).entities[0].kind).toBe('PATTERNS');
	});

	it('parses clean, with its title and description', () => {
		const doc = parseSdoc(SRC);
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as { title: string; description: string | null };
		expect(entity.title).toBe('Patterns / Burger button');
		expect(entity.description).toBe('A Button and an icon that folds.');
	});

	it('holds examples, prose and notes — but never previews', () => {
		const e = parseSdoc(SRC).entities[0] as {
			examples: { title: string }[];
			prose: string[];
			notes: unknown[];
			previews: unknown[];
		};
		expect(e.examples.map((x) => x.title)).toEqual(['Icon only', 'With label']);
		expect(e.prose).toHaveLength(1);
		expect(e.notes).toHaveLength(1);
		// The prop half, switched off.
		expect(e.previews).toEqual([]);
	});

	it('keeps the authored order, so prose sits between the examples', () => {
		const e = parseSdoc(SRC).entities[0] as { flow: { kind: string }[] };
		expect(e.flow.map((f) => f.kind)).toEqual(['example', 'prose', 'example']);
	});

	it('takes the stage attributes', () => {
		const doc = parseSdoc(
			'[PATTERNS title="P" maxWidth="480px" direction="column" gap="16px"]\n\t[EXAMPLE title="A"]\n\t\t<b>x</b>\n\t[/EXAMPLE]\n[/PATTERNS]\n',
		);
		expect(doc.diagnostics).toEqual([]);
		const sizing = (doc.entities[0] as { sizing: Record<string, unknown> }).sizing;
		expect(sizing.maxWidth).toBe('480px');
		expect(sizing.direction).toBe('column');
	});

	it('requires a title', () => {
		const doc = parseSdoc('[PATTERNS]\n\t[EXAMPLE title="A"]\n\t\t<b>x</b>\n\t[/EXAMPLE]\n[/PATTERNS]\n');
		expect(doc.diagnostics.map((d) => d.message).join()).toContain('requires title');
	});
});

describe('what a pattern refuses', () => {
	it('points at [SHOWCASE] for a [COMPONENT]', () => {
		// The author wants the other entity. A props panel here would document
		// one part of a composition and imply it was the whole.
		const doc = parseSdoc(
			'[PATTERNS title="P"]\n\n\t[COMPONENT component={X}]\n\t\t<X />\n\t[/COMPONENT]\n\n[/PATTERNS]\n',
		);
		const msg = doc.diagnostics.map((d) => d.message).join();
		expect(msg).toContain('[COMPONENT] is not allowed in a [PATTERNS]');
		expect(msg).toContain('[SHOWCASE]');
		// And no preview is produced from it.
		expect((doc.entities[0] as { previews: unknown[] }).previews).toEqual([]);
	});

	it('asks for an [EXAMPLE] around loose markup', () => {
		const doc = parseSdoc('[PATTERNS title="P"]\n\n\t<b>loose</b>\n\n[/PATTERNS]\n');
		expect(doc.diagnostics.map((d) => d.message).join()).toContain('[EXAMPLE]');
	});
});

describe('the kind survives the trip to a DocEntry', () => {
	it('is "pattern", and its examples get their own routes', async () => {
		// The bug this exists for: a ternary chain ending `: 'layout'` produced
		// a valid union member, so the compiler was happy and a pattern
		// rendered as a layout.
		const root = mkdtempSync(join(tmpdir(), 'sdocs-patterns-'));
		writeFileSync(join(root, 'sdocs.config.js'), "export default { include: ['./*.sdoc'] };\n");
		writeFileSync(join(root, 'P.sdoc'), SRC);
		const map = await buildSiteMap(await loadConfig(root), root);
		expect(map.errors).toEqual([]);
		const targets = [...map.routes.values()];
		expect(targets[0].doc.kind).toBe('pattern');
		// Each example is addressable, the way a showcase's are — which is what
		// puts them in the sidebar under their pattern.
		const named = targets.filter((t) => t.snippetName).map((t) => t.snippetName);
		expect(named).toEqual(['Icon only', 'With label']);
	});
});
