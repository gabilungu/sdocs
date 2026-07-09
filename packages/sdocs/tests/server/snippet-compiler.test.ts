import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import {
	generateIframeComponent,
	generatePageComponent,
	generatePreviewHtml,
	resolveScriptImports,
} from '../../src/lib/server/snippet-compiler.js';
import { parseSdoc } from '../../src/lib/language/parser.js';

describe('root ref injection', () => {
	it('binds the documented component, not the wrapper', () => {
		const out = generateIframeComponent('', '<Tabs>\n\t<Tab {...args} />\n</Tabs>', [], 'Tab');
		expect(out).toContain('<Tab bind:this={__sdocsRef} {...args} />');
		expect(out).not.toContain('<Tabs bind:this');
	});

	it('binds the first capitalized tag when no component is named', () => {
		const out = generateIframeComponent('', '<Card><Button /></Card>', []);
		expect(out).toContain('<Card bind:this={__sdocsRef}>');
	});

	it('falls back to the first capitalized tag when the named component is absent', () => {
		const out = generateIframeComponent('', '<Tabs active={0}>text</Tabs>', [], 'Tab');
		expect(out).toContain('<Tabs bind:this={__sdocsRef} active={0}>');
	});

	it('leaves snippets with an author bind:this untouched', () => {
		const body = '<Tab bind:this={mine} />';
		const out = generateIframeComponent('', body, [], 'Tab');
		expect(out).toContain(body);
		expect(out).not.toContain('bind:this={__sdocsRef}');
	});

	it('ignores tag-shaped text inside attribute strings (review regression F6)', () => {
		const out = generateIframeComponent('', '<div data-code="<Button/>"><Card /></div>', []);
		expect(out).toContain('<Card bind:this={__sdocsRef} />');
		expect(out).toContain('data-code="<Button/>"');
	});

	it('ignores tag-shaped text inside expression strings', () => {
		const out = generateIframeComponent('', "<div title={'<Fake/>'}><Card /></div>", []);
		expect(out).toContain('<Card bind:this={__sdocsRef} />');
	});

	it('a bind:this on another element does not suppress binding the target', () => {
		const out = generateIframeComponent('', '<Card><div bind:this={el}></div></Card>', []);
		expect(out).toContain('<Card bind:this={__sdocsRef}>');
	});

	it('a bind:this substring inside an attribute string does not suppress injection', () => {
		const out = generateIframeComponent('', '<Card note="use bind:this here" />', []);
		expect(out).toContain('<Card bind:this={__sdocsRef} note="use bind:this here" />');
	});
});

describe('script prelude (shared values)', () => {
	it('lifts imports AND shared values from the file script into the preview', () => {
		const prelude = "import Select from '/abs/Select.svelte';\nconst sizes = [{ label: 'xs', value: 'xs' }];";
		const out = generateIframeComponent(prelude, '<Select options={sizes} />', []);
		expect(out).toContain("import Select from '/abs/Select.svelte';");
		expect(out).toContain('const sizes = [');
	});

	it('resolves relative import specifiers in the script to absolute paths', () => {
		const script = `import Button from './Button.svelte';\nimport './styles.css';`;
		const resolved = resolveScriptImports(script, '/proj/src/Widget.sdoc');
		expect(resolved).toContain("import Button from '/proj/src/Button.svelte'");
		expect(resolved).toContain("import '/proj/src/styles.css'");
	});

	it('resolves multi-line named imports', () => {
		const script = "import {\n\tA,\n\tB,\n} from './pair.js';";
		const resolved = resolveScriptImports(script, '/proj/src/Widget.sdoc');
		expect(resolved).toContain("from '/proj/src/pair.js'");
	});

	it('never rewrites import-shaped text inside string literals (code samples)', () => {
		const script = [
			"import Real from './Real.svelte';",
			'const sample = [',
			'\t\'<script lang="ts">\',',
			`\t"\\timport Button from './Button.svelte';",`,
			"].join('\\n');",
		].join('\n');
		const resolved = resolveScriptImports(script, '/proj/src/Widget.sdoc');
		expect(resolved).toContain("import Real from '/proj/src/Real.svelte'");
		expect(resolved).toContain("import Button from './Button.svelte'");
	});

	it('never rewrites import-shaped lines inside template literals (review regression F4)', () => {
		const script = [
			"import Real from './Real.svelte';",
			'const sample = `',
			"import Button from './Button.svelte';",
			'`;',
		].join('\n');
		const resolved = resolveScriptImports(script, '/proj/src/Widget.sdoc');
		expect(resolved).toContain("import Real from '/proj/src/Real.svelte'");
		expect(resolved).toContain("import Button from './Button.svelte'");
	});

	it('never rewrites commented-out imports', () => {
		const script = "// import Old from './Old.svelte';\nimport New from './New.svelte';";
		const resolved = resolveScriptImports(script, '/proj/src/Widget.sdoc');
		expect(resolved).toContain("// import Old from './Old.svelte';");
		expect(resolved).toContain("import New from '/proj/src/New.svelte'");
	});
});

describe('reserved names surface as parse diagnostics, not compile failures (F1/F2)', () => {
	it('a file script declaring args breaks the iframe wrapper — and the parser flags it', () => {
		const fileScript = 'const args = { shared: true };';
		const generated = generateIframeComponent(fileScript, '<b>x</b>', []);
		expect(() => compile(generated, { generate: 'client' })).toThrow(/already been declared/);
		const doc = parseSdoc(
			`<script>\n\t${fileScript}\n</script>\n\n[SHOWCASE title="X"]\n\t[example title="A"]\n\t\t<b>x</b>\n\t[/example]\n[/SHOWCASE]\n`,
		);
		expect(doc.diagnostics.map((d) => d.code)).toContain('reserved-name');
	});

	it('a PAGE script using $props() breaks the page component — and the parser flags it', () => {
		const script = 'let { data } = $props();';
		const generated = generatePageComponent(script, '<p>x</p>');
		expect(() => compile(generated, { generate: 'client' })).toThrow(/more than once/);
		const doc = parseSdoc(
			`[PAGE title="P"]\n\t<script>\n\t\t${script}\n\t</script>\n\t<b>{data}</b>\n[/PAGE]\n`,
		);
		expect(doc.diagnostics.map((d) => d.code)).toContain('reserved-name');
	});

	it('a DOC script declaring __sdocsExample breaks the page component — and the parser flags it', () => {
		const script = 'const __sdocsExample = 1;';
		const generated = generatePageComponent(script, '<p>x</p>');
		expect(() => compile(generated, { generate: 'client' })).toThrow(/already been declared/);
		const doc = parseSdoc(
			`[DOC title="D"]\n\t<script>\n\t\t${script}\n\t</script>\n\tbody\n[/DOC]\n`,
		);
		expect(doc.diagnostics.map((d) => d.code)).toContain('reserved-name');
	});
});

describe('stage sizing', () => {
	it('applies padding and max-width inside the iframe, centered', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '800px',
			padding: '24px',
		});
		expect(out).toContain('style="display: flow-root; padding: 24px; max-width: 800px; margin-inline: auto"');
	});

	it('a constrained flex stage follows contentX for its margin', () => {
		const at = (contentX: string) =>
			generateIframeComponent('', '<b>x</b>', [], undefined, {
				maxWidth: '200px',
				padding: '16px',
				direction: 'row',
				gap: '8px',
				contentX,
				contentY: 'top',
			});
		expect(at('left')).toContain('max-width: 200px; margin-inline: 0"');
		expect(at('center')).toContain('max-width: 200px; margin-inline: auto"');
		expect(at('right')).toContain('max-width: 200px; margin-inline: auto 0"');
	});

	it('full-width stages get padding only', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%',
			padding: '16px',
		});
		expect(out).toContain('style="display: flow-root; padding: 16px"');
		expect(out).not.toContain('margin-inline');
	});

	it('flexes preview stages when direction is set', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%',
			padding: '16px',
			direction: 'column',
			gap: '8px',
			contentX: 'left',
			contentY: 'top',
		});
		expect(out).toContain(
			'style="display: flex; flex-direction: column; flex-wrap: wrap; justify-content: flex-start; align-items: flex-start; gap: 8px; padding: 16px"',
		);
	});

	it('maps contentX/contentY to the right flex axis for a row', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%', padding: '16px', direction: 'row', gap: '8px',
			contentX: 'center', contentY: 'bottom',
		});
		// row: horizontal → justify-content, vertical → align-items
		expect(out).toContain('justify-content: center; align-items: flex-end');
	});

	it('flips the axes for a column, and "justify" spreads along the flow', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%', padding: '16px', direction: 'column', gap: '8px',
			contentX: 'right', contentY: 'justify',
		});
		// column: vertical → justify-content (justify=space-between), horizontal → align-items
		expect(out).toContain('justify-content: space-between; align-items: flex-end');
	});

	it('clamps a cross-axis "justify" to stretch (align-items has no space-between)', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%', padding: '16px', direction: 'column', gap: '8px',
			contentX: 'justify', contentY: 'top',
		});
		// column: horizontal(contentX=justify) → cross axis → space-between clamped to stretch
		expect(out).toContain('justify-content: flex-start; align-items: stretch');
	});

	it('stays bare flow-root without a stage', () => {
		const out = generateIframeComponent('', '<b>x</b>');
		expect(out).toContain('style="display: flow-root"');
	});
});

describe('block-level script and style (extras)', () => {
	it('appends the block script after the wrapper plumbing, so args is in scope', () => {
		const out = generateIframeComponent('', '<Nav {active} />', [], 'Nav', undefined, {
			blockScript: "let active = $state('Home');\nconst derived = $derived(args);",
		});
		const plumbingAt = out.indexOf('let args = $state({})');
		const blockAt = out.indexOf("let active = $state('Home')");
		expect(plumbingAt).toBeGreaterThan(-1);
		expect(blockAt).toBeGreaterThan(plumbingAt);
		// Still inside the single component <script>
		expect(blockAt).toBeLessThan(out.indexOf('</script>'));
	});

	it('emits stage styles as a real style element via {@html}', () => {
		const out = generateIframeComponent('', '<b class="dot">x</b>', [], undefined, undefined, {
			styles: '.dot { width: 8px; height: 8px; }',
		});
		expect(out).toContain('{@html');
		expect(out).toContain('.dot { width: 8px; height: 8px; }');
		// Never a component-level <style> (it would be Svelte-pruned per module)
		expect(out).not.toMatch(/\n<style>/);
	});

	it('omits both sections when extras are absent', () => {
		const out = generateIframeComponent('', '<b>x</b>', []);
		expect(out).not.toContain('{@html');
		expect(out).not.toContain('[block script]');
	});

	it('file style reaches the page component as a scoped style block', () => {
		const out = generatePageComponent('', '<p>hello</p>', '.big { font-size: 2em; }');
		expect(out).toContain('<style>\n.big { font-size: 2em; }\n</style>');
	});

	it('page component omits the style block when the file has none', () => {
		const out = generatePageComponent('', '<p>hello</p>');
		expect(out).not.toContain('<style>');
	});
});

describe('stage background', () => {
	it('applies the resolved background to the stage element', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%',
			padding: '16px',
			direction: 'row',
			gap: '16px',
			background: 'var(--bg)',
		});
		expect(out).toContain('background: var(--bg)');
	});

	it('omits background when unset', () => {
		const out = generateIframeComponent('', '<b>x</b>', [], undefined, {
			maxWidth: '100%',
			padding: '16px',
		});
		expect(out).not.toContain('background:');
	});
});

describe('preview page base', () => {
	it('emits a <base href> so base-relative assets resolve under any deploy path', () => {
		const html = generatePreviewHtml('/@sdocs/iframe/x/y.svelte', null, '/gabi/');
		expect(html).toContain('<base href="/gabi/">');
	});

	it('defaults to the root base in dev', () => {
		const html = generatePreviewHtml('/@sdocs/iframe/x/y.svelte', null);
		expect(html).toContain('<base href="/">');
	});
});
