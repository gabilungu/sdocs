/**
 * `[PATTERN]` — one composition documented as a single thing.
 *
 * A fifth entity kind, and a kind that is half-added is the failure mode: the
 * kind is enumerated in the scanner, the parser, `DocEntry`, the grammar, the
 * Explorer's view dispatch, the sidebar, the MCP index and three ternary
 * chains. During the build one of those chains ended `: 'layout'`, so a
 * pattern parsed correctly, routed correctly, and rendered as a layout — no
 * title, no description, no code panel, and nothing anywhere said so.
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
	import Avatar from './Avatar.svelte';
</script>

[PATTERN title="Patterns / User Menu" description="Avatar, menu and badge."]

	<Avatar name="Ada" /> <Menu>Profile</Menu>

[/PATTERN]
`;

describe('the entity', () => {
	it('is one of the kinds the scanner knows', () => {
		expect(ENTITY_KINDS).toContain('PATTERN');
		expect(scanSdoc(SRC).entities[0].kind).toBe('PATTERN');
	});

	it('parses with its title, description and body', () => {
		const doc = parseSdoc(SRC);
		expect(doc.diagnostics).toEqual([]);
		const [entity] = doc.entities;
		expect(entity.kind).toBe('PATTERN');
		expect(entity.title).toBe('Patterns / User Menu');
		expect((entity as { description?: string | null }).description).toBe(
			'Avatar, menu and badge.',
		);
		// The body is the composition, kept as written.
		expect((entity as { body: string }).body).toContain('<Avatar name="Ada" />');
	});

	it('composes from the file script', () => {
		// The imports above the entity are the file's, shared by everything in
		// it — the same arrangement every other entity uses.
		expect(parseSdoc(SRC).script?.content).toContain("import Avatar from './Avatar.svelte'");
		expect(parseSdoc(SRC).entities[0].script).toBeNull();
	});

	it('also takes a script of its own', () => {
		const doc = parseSdoc(
			'[PATTERN title="P"]\n\t<script lang="ts">\n\t\tconst who = "Ada";\n\t</script>\n\t<b>{who}</b>\n[/PATTERN]\n',
		);
		expect(doc.diagnostics).toEqual([]);
		const entity = doc.entities[0] as { script: { content: string } | null; body: string };
		expect(entity.script?.content).toContain('const who = "Ada"');
		// And the script is lifted out of the body, which is what gets staged.
		expect(entity.body).not.toContain('const who');
		expect(entity.body).toContain('<b>{who}</b>');
	});

	it('takes the stage attributes', () => {
		const doc = parseSdoc(
			'[PATTERN title="P" maxWidth="480px" direction="column" gap="16px"]\n\t<b>x</b>\n[/PATTERN]\n',
		);
		expect(doc.diagnostics).toEqual([]);
		const sizing = (doc.entities[0] as { sizing: Record<string, unknown> }).sizing;
		expect(sizing.maxWidth).toBe('480px');
		expect(sizing.direction).toBe('column');
	});

	it('requires a title', () => {
		const doc = parseSdoc('[PATTERN]\n\t<b>x</b>\n[/PATTERN]\n');
		expect(doc.diagnostics.map((d) => d.message).join()).toContain('requires title');
	});
});

describe('what a pattern refuses', () => {
	const inBody = (block: string) =>
		parseSdoc(`[PATTERN title="P"]\n\n\t${block}\n\n[/PATTERN]\n`).diagnostics.map((d) => d.message);

	it('points at [SHOWCASE] for a [COMPONENT]', () => {
		// The author wants the other entity; saying so is more use than saying
		// this one renders as text.
		const msg = inBody('[COMPONENT component={X}]\n\t\t<X />\n\t[/COMPONENT]').join();
		expect(msg).toContain('[COMPONENT] is not read inside a [PATTERN]');
		expect(msg).toContain('[SHOWCASE]');
	});

	it('points at [SHOWCASE] for an [EXAMPLE]', () => {
		expect(inBody('[EXAMPLE title="A"]\n\t\t<b>x</b>\n\t[/EXAMPLE]').join()).toContain('[SHOWCASE]');
	});

	it('reports a text block as rendering literally', () => {
		const msg = inBody('[NOTES]\n\t\t- tip: hi\n\t[/NOTES]').join();
		expect(msg).toContain('[NOTES] is not read inside a [PATTERN]');
		expect(msg).toContain('literal text');
	});

	it('names an attribute it does not take', () => {
		const doc = parseSdoc('[PATTERN title="P" nope="x"]\n\t<b>x</b>\n[/PATTERN]\n');
		expect(doc.diagnostics.map((d) => d.message).join()).toContain('nope');
	});
});

describe('the kind survives the trip to a DocEntry', () => {
	it('is "pattern", not "layout"', async () => {
		// The bug this exists for: a ternary chain ending `: 'layout'` produced
		// a valid union member, so the compiler was happy and the wrong view
		// rendered.
		const root = mkdtempSync(join(tmpdir(), 'sdocs-pattern-'));
		writeFileSync(join(root, 'sdocs.config.js'), "export default { include: ['./*.sdoc'] };\n");
		writeFileSync(join(root, 'P.sdoc'), SRC);
		const map = await buildSiteMap(await loadConfig(root), root);
		expect(map.errors).toEqual([]);
		const target = [...map.routes.values()][0];
		expect(target.doc.kind).toBe('pattern');
	});
});
