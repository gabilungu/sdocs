// @vitest-environment happy-dom

/**
 * The first tests that actually render a component.
 *
 * Until now nothing in this suite mounted anything: the Explorer was covered
 * only by its server render, through the prerendering the end-to-end build
 * tests exercise. That catches "does it throw", not "does it produce the right
 * thing", and every interface bug found in the recent audit — a control with
 * no accessible name, a tablist that ignored the arrow keys, a route that fell
 * through to the wrong view — lived in the gap.
 *
 * What this harness cannot do, so nobody reaches for it and is disappointed:
 * happy-dom applies no CSS and computes no layout. `getBoundingClientRect()`
 * returns zeros. Anything about position, overlap or size — the class of bug
 * where an invisible hover zone sat over the top bar and swallowed clicks —
 * needs a real browser, and is checked against a running dev server instead.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PropControl from '../../src/lib/explorer/views/PropControl.svelte';
import ContentError from '../../src/lib/explorer/views/ContentError.svelte';
import type { ParsedProp } from '../../src/lib/types.js';

let target: HTMLElement | undefined;
let instance: Record<string, unknown> | undefined;

afterEach(() => {
	if (instance) unmount(instance);
	target?.remove();
	instance = undefined;
	target = undefined;
});

/** Mount into a fresh element and return it. */
function render(Component: Parameters<typeof mount>[0], props: Record<string, unknown>) {
	target = document.createElement('div');
	document.body.append(target);
	instance = mount(Component, { target, props }) as Record<string, unknown>;
	flushSync();
	return target;
}

const prop = (over: Partial<ParsedProp>): ParsedProp =>
	({
		name: 'label',
		type: 'string',
		default: null,
		description: null,
		required: false,
		category: 'prop',
		...over,
	}) as ParsedProp;

describe('a prop control names itself', () => {
	// The name lives in a neighbouring table cell, which a screen reader does
	// not attribute to the control — they announced as unlabelled inputs.
	it('gives a text input an accessible name', () => {
		const el = render(PropControl, {
			prop: prop({ name: 'label', type: 'string' }),
			value: 'hi',
			onchange: () => {},
			onunset: () => {},
		});
		const input = el.querySelector('input');
		expect(input).toBeTruthy();
		expect(input?.getAttribute('aria-label')).toBe('label');
	});

	it('gives a checkbox an accessible name', () => {
		const el = render(PropControl, {
			prop: prop({ name: 'disabled', type: 'boolean' }),
			value: true,
			onchange: () => {},
			onunset: () => {},
		});
		const input = el.querySelector('input[type="checkbox"]');
		expect(input?.getAttribute('aria-label')).toBe('disabled');
	});

	it('gives a select an accessible name', () => {
		const el = render(PropControl, {
			prop: prop({ name: 'size', type: "'sm' | 'md'" }),
			value: 'sm',
			onchange: () => {},
			onunset: () => {},
		});
		expect(el.querySelector('select')?.getAttribute('aria-label')).toBe('size');
	});
});

describe('the content error card', () => {
	it('announces itself and shows what went wrong', () => {
		const el = render(ContentError, {
			error: new Error('chunk exploded'),
			kind: 'load',
			title: 'Guides / Button',
		});
		const card = el.querySelector('[role="alert"]');
		expect(card).toBeTruthy();
		expect(card?.textContent).toContain('failed to load');
		expect(card?.textContent).toContain('Guides / Button');
		// The real message, not a generic apology.
		expect(card?.textContent).toContain('chunk exploded');
	});

	it('says something different when the render threw', () => {
		const el = render(ContentError, { error: new Error('boom'), kind: 'render' });
		expect(el.querySelector('[role="alert"]')?.textContent).toContain('threw while rendering');
	});
});
