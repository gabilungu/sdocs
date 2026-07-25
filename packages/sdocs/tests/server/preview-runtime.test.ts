import { describe, it, expect } from 'vitest';
import {
	describeStages,
	stageAttrs,
	stageId,
	stageIdentity,
	PREVIEW_BOOTSTRAP_JS,
	PREVIEW_RUNTIME_JS,
} from '../../src/lib/server/preview-runtime.js';
import {
	generatePreviewHtml,
	lookupEntry,
	previewUrl,
	setDocPathRoot,
} from '../../src/lib/server/snippet-compiler.js';

describe('stage ids', () => {
	it('is stable for the same stage', () => {
		const a = stageId(stageIdentity('/p/src/Button.sdoc', 'button', 'x-sizes'));
		const b = stageId(stageIdentity('/p/src/Button.sdoc', 'button', 'x-sizes'));
		expect(a).toBe(b);
		expect(a).toMatch(/^[a-z0-9]{5}$/);
	});

	it('differs per stage, per entity, and per file', () => {
		const ids = new Set([
			stageId(stageIdentity('/p/src/Button.sdoc', 'button', 'x-sizes')),
			stageId(stageIdentity('/p/src/Button.sdoc', 'button', 'x-tones')),
			stageId(stageIdentity('/p/src/Button.sdoc', 'other', 'x-sizes')),
			stageId(stageIdentity('/p/src/Other.sdoc', 'button', 'x-sizes')),
		]);
		expect(ids.size).toBe(4);
	});

	it('does not depend on the caller\'s working directory', () => {
		// The dev server encodes against its staging dir and the MCP server
		// against the project; an id that disagreed between them would send a
		// person and a tool to different stages.
		expect(stageIdentity('/p/src/Button.sdoc', 'button', 'x')).toBe(
			'/p/src/Button.sdoc#button/x',
		);
	});
});

describe('one canonical doc-path root (report #13)', () => {
	it('encodes a stage the same way whichever process asks', () => {
		// The dev server, the build, and both MCP transports all encode
		// against the project. Two roots meant stdio handed out a token the
		// dev server served a shell for and then couldn't find the module
		// behind — a page that loads and shows nothing.
		setDocPathRoot('/proj');
		const fromOneProcess = previewUrl('/proj/src/Button.sdoc', 'button', 'x-sizes');
		setDocPathRoot('/proj');
		const fromAnother = previewUrl('/proj/src/Button.sdoc', 'button', 'x-sizes');
		expect(fromOneProcess).toBe(fromAnother);
		expect(fromOneProcess).not.toContain('Li4v'); // no '../' climbing out of a staging dir
	});

	it('still finds an entry for a token encoded against a different root', () => {
		const entries = new Map([['/proj/src/Button.sdoc#button', { name: 'entry' }]]);
		// What a staging-dir-rooted token decodes to.
		expect(
			lookupEntry(entries, {
				docFilePath: '/somewhere/else/src/Button.sdoc',
				entitySlug: 'button',
				relPath: 'src/Button.sdoc',
			}),
		).toEqual({ name: 'entry' });
	});

	it('does not match a different file that merely ends the same way', () => {
		const entries = new Map([['/proj/src/ui/Button.sdoc#button', { name: 'ui' }]]);
		expect(
			lookupEntry(entries, {
				docFilePath: '/x/Button.sdoc',
				entitySlug: 'button',
				relPath: 'other/Button.sdoc',
			}),
		).toBeUndefined();
	});
});

describe('describeStages', () => {
	const entity = { kind: 'SHOWCASE', slug: 'button' };
	const planned = [
		{ slug: 'button', name: 'Button', role: 'preview', componentName: 'Button' },
		{ slug: 'x-sizes', name: 'Sizes', role: 'example' },
	];

	it('names a preview a component and carries what it demonstrates', () => {
		const [preview, example] = describeStages(entity, planned, '/p/src/Button.sdoc');
		expect(preview).toMatchObject({ kind: 'component', name: 'Button', component: 'Button' });
		expect(example).toMatchObject({ kind: 'example', name: 'Sizes', component: null });
	});

	it('gives a LAYOUT body its entity kind', () => {
		const [stage] = describeStages(
			{ kind: 'LAYOUT', slug: 'dash' },
			[{ slug: 'content', name: 'Content', role: 'content' }],
			'/p/src/Dash.sdoc',
		);
		expect(stage.kind).toBe('layout');
	});
});

describe('stageAttrs', () => {
	it('escapes a name that would otherwise break out of the attribute', () => {
		const attrs = stageAttrs({ id: 'abc12', kind: 'example', name: 'He said "hi" <b>' });
		expect(attrs).toContain('&quot;');
		expect(attrs).toContain('&lt;b&gt;');
		expect(attrs).not.toMatch(/name="[^"]*"[^ ]/);
	});

	it('omits the component attribute when there is none', () => {
		expect(stageAttrs({ id: 'abc12', kind: 'example', name: 'X' })).not.toContain(
			'data-sdocs-component',
		);
	});
});

describe('the preview page', () => {
	const html = generatePreviewHtml('/@sdocs/iframe/x/y.svelte', null, '/', {
		id: 'abc12',
		kind: 'component',
		name: 'Button',
		component: 'Button',
	});

	it('carries the stage identity on <html>', () => {
		expect(html).toContain('data-sdocs-stage-id="abc12"');
		expect(html).toContain('data-sdocs-stage-kind="component"');
		expect(html).toContain('data-sdocs-component="Button"');
	});

	it('installs the failure bootstrap before the stage module', () => {
		// Order matters: a module that fails to load can't report anything
		// itself, so the fallback has to already be listening.
		expect(html.indexOf('data-sdocs-stage-error')).toBeLessThan(html.indexOf('type="module"'));
	});

	it('marks ready and exposes the capture API', () => {
		expect(html).toContain('data-sdocs-stage-ready');
		expect(html).toContain('window.__sdocs');
		expect(html).toContain('captureRect');
	});

	it('applies ?theme= and ?css= on a direct visit', () => {
		expect(html).toContain("params.get('theme')");
		expect(html).toContain("params.get('css')");
	});

	it('still carries no scoped style block for the stage itself', () => {
		// The generated stage must not introduce styling of its own — the
		// project's css is the only thing that reaches a preview.
		expect(html).not.toMatch(/<style>(?![^<]*body \{ margin: 0; \})/);
	});
});

describe('the injected runtime', () => {
	it('never treats an inset shadow as overflow', () => {
		expect(PREVIEW_RUNTIME_JS).toContain("indexOf('inset')");
	});

	it('reports whether the halo was cut off rather than silently cropping', () => {
		expect(PREVIEW_RUNTIME_JS).toContain('clipped');
		expect(PREVIEW_RUNTIME_JS).toContain('bleeds');
	});

	it('waits for fonts and images before declaring the stage photographable', () => {
		expect(PREVIEW_RUNTIME_JS).toContain('document.fonts');
		expect(PREVIEW_RUNTIME_JS).toContain('decode');
	});

	it('always ends up ready, so a client never waits forever on a broken stage', () => {
		expect(PREVIEW_BOOTSTRAP_JS).toContain("fail('timeout')");
		expect(PREVIEW_BOOTSTRAP_JS).toContain("fail('script')");
	});
});
