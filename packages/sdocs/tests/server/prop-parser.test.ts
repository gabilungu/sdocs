import { describe, expect, it } from 'vitest';
import { parseComponentSource } from '../../src/lib/server/prop-parser.js';

function byName(list: { name: string }[], name: string) {
	const found = list.find((item) => item.name === name);
	expect(found, `expected to find "${name}"`).toBeDefined();
	return found!;
}

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

describe('methods, state, and CSS custom properties', () => {
	const source = `<script lang="ts">
	/** Clears the value */
	export function clear(): void {}

	/** Current count */
	export const count = $state(0);

	/**
	 * @cssvar {color} --bg - Background color
	 * @cssvar {dimension} --radius - Corner radius
	 */
</script>

<style>
	.x {
		background: var(--bg, #333);
		border-radius: var(--radius, 4px);
		padding: var(--pad, 8px);
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

	it('extracts CSS vars, merging @cssvar type/description with var() defaults', () => {
		const bg = byName(data.cssProps, '--bg');
		expect(bg.type).toBe('color');
		expect(bg.default).toBe('#333');
		expect(bg.description).toBe('Background color');

		const pad = byName(data.cssProps, '--pad');
		expect(pad.type).toBe(null);
		expect(pad.default).toBe('8px');
	});
});
