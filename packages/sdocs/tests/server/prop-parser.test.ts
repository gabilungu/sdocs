import { describe, expect, it } from 'vitest';
import { parseComponentSource } from '../../src/lib/server/prop-parser.js';

function byName(list: { name: string }[], name: string) {
	const found = list.find((item) => item.name === name);
	expect(found, `expected to find "${name}"`).toBeDefined();
	return found!;
}

describe('module + instance scripts', () => {
	// A leading `<script module>` must not hide the instance script's props.
	const source = `<script module lang="ts">
	let uid = 0;
</script>

<script lang="ts">
	interface Props {
		value?: string;
		size?: 'sm' | 'md' | 'lg';
	}
	let { value = '', size = 'md' }: Props = $props();
</script>

<div></div>`;

	it('extracts props from the instance script alongside a module script', () => {
		const { props } = parseComponentSource(source);
		const names = props.map((p) => p.name);
		expect(names).toContain('value');
		expect(names).toContain('size');
		expect(byName(props, 'size').default).toBe('md');
	});
});

describe('TypeScript components (interface Props)', () => {
	const source = `<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The button label text */
		label?: string;
		/** Visual style variant */
		variant?: 'primary' | 'secondary';
		count: number;
		/** Click handler */
		onclick?: (e: MouseEvent) => void;
		oneTime?: boolean;
		children?: Snippet;
		item?: Snippet<[value: string]>;
	}

	let { label = 'Button', variant = 'primary', count, onclick, oneTime, children, item }: Props = $props();
</script>

<button>{label}</button>`;

	const data = parseComponentSource(source);

	it('extracts types, defaults, descriptions, and requiredness', () => {
		const label = byName(data.props, 'label');
		expect(label.type).toBe('string');
		expect(label.default).toBe('Button');
		expect(label.description).toBe('The button label text');
		expect(label.required).toBe(false);

		const count = byName(data.props, 'count');
		expect(count.type).toBe('number');
		expect(count.default).toBe(null);
		expect(count.required).toBe(true);
	});

	it('classifies events, snippets, and on-prefixed non-functions', () => {
		expect(byName(data.props, 'onclick').category).toBe('event');
		expect(byName(data.props, 'oneTime').category).toBe('prop');
		expect(byName(data.props, 'children').category).toBe('snippet');
		expect(byName(data.props, 'item').category).toBe('snippet');
	});
});

describe('JS components with @type {{ ... }} annotation', () => {
	const source = `<script>
	/** @type {{ label?: string, size?: 'sm' | 'lg', onclick?: (e: MouseEvent) => void }} */
	let { label = 'Badge', size = 'sm', onclick } = $props();
</script>

<span>{label}</span>`;

	const data = parseComponentSource(source);

	it('extracts types and optionality from the annotation', () => {
		const label = byName(data.props, 'label');
		expect(label.type).toBe('string');
		expect(label.default).toBe('Badge');
		expect(label.required).toBe(false);
		expect(byName(data.props, 'size').type).toBe("'sm' | 'lg'");
	});

	it('classifies events from JSDoc function types', () => {
		expect(byName(data.props, 'onclick').category).toBe('event');
	});
});

describe('JS components with @typedef/@property', () => {
	const source = `<script>
	/**
	 * @typedef {Object} Props
	 * @property {string} [label] - The badge label
	 * @property {number} count - How many
	 * @property {() => void} [ondismiss] - Called when dismissed
	 * @property {import('svelte').Snippet} [children] - Body content
	 */

	/** @type {Props} */
	let { label = 'Badge', count, ondismiss, children } = $props();
</script>

<span>{label}{count}</span>`;

	const data = parseComponentSource(source);

	it('extracts types, descriptions, and optionality from @property tags', () => {
		const label = byName(data.props, 'label');
		expect(label.type).toBe('string');
		expect(label.description).toBe('The badge label');
		expect(label.required).toBe(false);
		expect(label.default).toBe('Badge');

		const count = byName(data.props, 'count');
		expect(count.type).toBe('number');
		expect(count.description).toBe('How many');
		expect(count.required).toBe(true);
	});

	it('classifies events and imported Snippet types', () => {
		expect(byName(data.props, 'ondismiss').category).toBe('event');
		expect(byName(data.props, 'children').category).toBe('snippet');
	});
});

describe('untyped JS components', () => {
	it('still extracts names and defaults from destructuring', () => {
		const data = parseComponentSource(`<script>
	let { label = 'x', flag } = $props();
</script>`);
		expect(byName(data.props, 'label').default).toBe('x');
		expect(byName(data.props, 'label').type).toBe(null);
		expect(byName(data.props, 'flag').required).toBe(true);
	});
});

describe('inherited attributes pulled out of ...rest', () => {
	it('an explicitly destructured native attribute stays optional', () => {
		const data = parseComponentSource(`<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		text: string;
	}

	let { text, style, id, title, ...rest }: Props = $props();
</script>

<div {style} {id} {title} {...rest}>{text}</div>`);
		// Declared and non-optional in the interface — genuinely required.
		expect(byName(data.props, 'text').required).toBe(true);
		// Inherited through the heritage: destructuring one out of ...rest must
		// not turn it into a required prop.
		for (const name of ['style', 'id', 'title']) {
			expect(byName(data.props, name).required).toBe(false);
		}
	});

	it('a destructured aria attribute stays optional too', () => {
		const data = parseComponentSource(`<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		label?: string;
	}

	let { label, 'aria-label': ariaLabel, ...rest }: Props = $props();
</script>

<button aria-label={ariaLabel} {...rest}>{label}</button>`);
		const aria = data.props.find((p) => p.name.includes('aria-label'));
		expect(aria?.required).toBe(false);
	});
});

describe('class / ...rest forwarding (chips, not prop rows)', () => {
	it('TS: extends HTMLAttributes + class alias + rest spread', () => {
		const data = parseComponentSource(`<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		/** The label */
		text?: string;
	}

	let { text = 'Placeholder', class: className, ...rest }: Props = $props();
</script>

<div class={['Box', className]} {...rest}>{text}</div>`);
		// Own props only — no phantom `class` or `rest` rows
		expect(data.props.map((p) => p.name)).toEqual(['text']);
		expect(data.acceptsClass).toBe(true);
		expect(data.forwardsRest).toBe(true);
		expect(data.restType).toBe('HTMLAttributes<HTMLDivElement>');
	});

	it('TS: class declared explicitly in the interface is a chip too', () => {
		const data = parseComponentSource(`<script lang="ts">
	interface Props {
		path: string;
		class?: string;
	}

	let { path, class: className = '' }: Props = $props();
</script>

<span class="Icon {className}">{path}</span>`);
		expect(data.props.map((p) => p.name)).toEqual(['path']);
		expect(data.acceptsClass).toBe(true);
		expect(data.forwardsRest).toBe(false);
		expect(data.restType).toBe(null);
	});

	it('plain JS: detection is syntactic on the destructure, no types needed', () => {
		const data = parseComponentSource(`<script>
	let { label = 'x', class: cls, ...attrs } = $props();
</script>`);
		expect(data.props.map((p) => p.name)).toEqual(['label']);
		expect(data.acceptsClass).toBe(true);
		expect(data.forwardsRest).toBe(true);
		expect(data.restType).toBe(null);
	});

	it('JSDoc-typed JS: typedef props survive, class/rest become flags', () => {
		const data = parseComponentSource(`<script>
	/**
	 * @typedef {Object} Props
	 * @property {string} [label] - The badge label
	 */

	/** @type {Props} */
	let { label = 'Badge', class: cls, ...rest } = $props();
</script>`);
		expect(data.props.map((p) => p.name)).toEqual(['label']);
		expect(byName(data.props, 'label').description).toBe('The badge label');
		expect(data.acceptsClass).toBe(true);
		expect(data.forwardsRest).toBe(true);
		expect(data.restType).toBe(null);
	});

	it('components without class/rest report falsy flags', () => {
		const data = parseComponentSource(`<script lang="ts">
	interface Props { label?: string }
	let { label = 'x' }: Props = $props();
</script>`);
		expect(data.acceptsClass).toBe(false);
		expect(data.forwardsRest).toBe(false);
		expect(data.restType).toBe(null);
	});
});

describe('methods, state, and CSS custom properties', () => {
	const source = `<script lang="ts">
	/** Clears the value */
	export function clear(): void {}

	/** Current count */
	export const count = $state(0);

	/**
	 * @cssvar {color} --bg - Background color
	 * @cssvar {dimension} --radius - Corner radius
	 * @cssvar {shadow} --ring - Focus ring
	 */
</script>

<style>
	.x {
		background: var(--bg, #333);
		border-radius: var(--radius, 4px);
		padding: var(--pad, 8px);
		box-shadow: 0 0 0 var(--ring, rgba(0, 0, 0, 0.5));
		color: var(--fg, var(--bg));
	}
</style>`;

	const data = parseComponentSource(source);

	it('extracts exported functions with descriptions', () => {
		const clear = byName(data.methods, 'clear');
		expect(clear.returnType).toBe('void');
		expect(clear.description).toBe('Clears the value');
	});

	it('extracts exported state', () => {
		expect(byName(data.state, 'count').description).toBe('Current count');
	});

	it('documents only @cssvar-annotated vars, taking defaults from the style', () => {
		const names = data.cssProps.map((p) => p.name);
		// Annotated → part of the public CSS API.
		expect(names).toContain('--bg');
		expect(names).toContain('--radius');
		// Used in the style but never annotated → internal, excluded.
		expect(names).not.toContain('--pad');
		expect(names).not.toContain('--fg');

		const bg = byName(data.cssProps, '--bg');
		expect(bg.type).toBe('color');
		expect(bg.default).toBe('#333'); // from var(--bg, #333)
		expect(bg.description).toBe('Background color');
	});

	it('captures a documented default with one level of nested parens', () => {
		// --ring is annotated, so its var(--ring, rgba(…)) default is kept.
		expect(byName(data.cssProps, '--ring').default).toBe('rgba(0, 0, 0, 0.5)');
	});
});

describe('CSS prop defaults: declarations, Mixed, comments', () => {
	it('a --x: value declaration on the root wins as the default', () => {
		const data = parseComponentSource(`<script lang="ts">
	/** @cssvar {length} --pad - Padding. */
	interface Props { a?: string }
	let { a }: Props = $props();
</script>
<div class="X">x</div>
<style>
	.X { --pad: 8px; padding: var(--pad); margin: var(--pad, 12px); }
</style>`);
		expect(data.cssProps[0].default).toBe('8px');
		expect(data.cssProps[0].defaultUses).toBeUndefined();
	});

	it('divergent var() fallbacks become Mixed with a per-property breakdown', () => {
		const data = parseComponentSource(`<script lang="ts">
	/** @cssvar {color} --c - Color. */
	interface Props { a?: string }
	let { a }: Props = $props();
</script>
<div>x</div>
<style>
	.X { background: var(--c, red); color: var(--c, blue); }
</style>`);
		expect(data.cssProps[0].default).toBe(null);
		expect(data.cssProps[0].defaultUses).toEqual([
			{ property: 'background', value: 'red' },
			{ property: 'color', value: 'blue' },
		]);
	});

	it('agreeing fallbacks resolve normally; commented-out CSS is ignored', () => {
		const data = parseComponentSource(`<script lang="ts">
	/** @cssvar {color} --c - Color. */
	interface Props { a?: string }
	let { a }: Props = $props();
</script>
<div>x</div>
<style>
	/* background: var(--c, green); */
	.X { background: var(--c, red); color: var(--c, red); }
</style>`);
		expect(data.cssProps[0].default).toBe('red');
		expect(data.cssProps[0].defaultUses).toBeUndefined();
	});
});

describe('multi-line JSDoc descriptions', () => {
	const source = `<script lang="ts">
	interface Props {
		/** Width: 'fill' (100%), 'hug' (fit content), a number (px), or any CSS
		 * length. Default: 'fill'. */
		width?: string;
		/** Overflow behavior:
		 * - 'visible' — content can spill out
		 * - 'hidden' — clip both axes
		 */
		overflow?: string;
		/** One line only. */
		simple?: string;
	}
	let { width, overflow, simple }: Props = $props();
</script>
<div></div>`;

	const data = parseComponentSource(source);
	const byName = (name: string) => data.props.find((p) => p.name === name)!;

	it('rejoins hard-wrapped lines into their sentence', () => {
		expect(byName('width').description).toBe(
			"Width: 'fill' (100%), 'hug' (fit content), a number (px), or any CSS length. Default: 'fill'.",
		);
	});

	it('keeps list items on their own lines', () => {
		expect(byName('overflow').description).toBe(
			"Overflow behavior:\n- 'visible' — content can spill out\n- 'hidden' — clip both axes",
		);
	});

	it('leaves a single-line description untouched', () => {
		expect(byName('simple').description).toBe('One line only.');
	});
});
