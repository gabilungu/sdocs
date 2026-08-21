/**
 * Every dynamic content import is guarded, and the boot preload survives one
 * that isn't loadable.
 *
 * A rejected `pageModules[key]()` used to leave `{#if PageComponent}` with
 * nothing to render: the page kept its title, sidebar and table of contents,
 * and the content column was simply empty. The only trace was an unhandled
 * rejection in a console nobody had open. Worse, in the generated boot script
 * the same rejection aborted `boot()` before the mount call, so a prerendered
 * route looked completely right and was completely dead.
 *
 * These are source-level assertions because the views need a DOM to mount and
 * this repo has no DOM harness yet. They pin the shape, not the rendering —
 * the rendering was verified against a real broken build.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const views = resolve(__dirname, '../../src/lib/explorer/views');
const read = (p: string) => readFileSync(resolve(views, p), 'utf-8');

/** The three views that load a content chunk at runtime. */
const LOADERS = ['DocView.svelte', 'PageView.svelte', 'NativeBody.svelte'];

describe('content chunk failures are visible', () => {
	for (const file of LOADERS) {
		it(`${file} catches a rejected import`, () => {
			const src = read(file);
			// The import is chained, not bare: a bare `load().then(...)` is the
			// exact shape that produced the silent blank.
			expect(src, 'unguarded load()').not.toMatch(/load\(\)\.then\([^)]*\)\s*;/);
			expect(src).toContain('.catch((err) => {');
			expect(src).toContain('loadError = err;');
			// And it still says so in the console, for whoever is looking.
			expect(src).toContain("console.error('[sdocs]");
		});

		it(`${file} renders something when the load fails`, () => {
			expect(read(file)).toMatch(/\{:else if loadError\}\s*\n\s*<ContentError/);
		});

		it(`${file} catches a throw during render`, () => {
			const src = read(file);
			expect(src).toContain('<svelte:boundary>');
			expect(src).toContain('{#snippet failed(error)}');
		});

		it(`${file} clears the error when the route changes`, () => {
			// Without this the card from one page follows you to the next.
			expect(read(file)).toContain('loadError = null;');
		});
	}

	it('the error card announces itself', () => {
		const card = read('ContentError.svelte');
		expect(card).toContain('role="alert"');
		// It shows what actually went wrong, not a generic apology.
		expect(card).toContain('e?.stack || e?.message');
	});
});

describe('the generated boot survives an unloadable chunk', () => {
	const appGen = readFileSync(resolve(__dirname, '../../src/lib/server/app-gen.ts'), 'utf-8');

	it('wraps the preload so one bad key cannot abort boot', () => {
		expect(appGen).toContain('preloaded[key] = (await pageModules[key]()).default;');
		const boot = appGen.slice(appGen.indexOf('async function boot()'));
		expect(boot).toContain('try {');
		expect(boot).toContain('} catch (err) {');
	});

	it('falls back to a fresh mount rather than hydrating against nothing', () => {
		const boot = appGen.slice(appGen.indexOf('async function boot()'));
		// `prerendered` has to be reassignable for the fallback to exist at all.
		expect(boot).toContain('let prerendered =');
		expect(boot).toContain('prerendered = false;');
		// And the stale server HTML is cleared, or the fresh mount doubles it.
		expect(boot).toContain('target.replaceChildren()');
	});
});
