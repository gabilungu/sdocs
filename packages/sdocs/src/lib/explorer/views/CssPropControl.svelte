<script lang="ts">
	import type { ParsedCssProp } from '../../types.js';
	import { Text as TextControl, Color as ColorControl, Dimension as DimensionControl } from '../../ui/Control/index.js';

	interface Props {
		cssProp: ParsedCssProp;
		value: string | undefined;
		/** The computed color when the default is a var() reference — resolved
		 * inside the preview iframe, where the project's theme lives. */
		resolvedColor?: string;
		onchange: (value: string) => void;
	}

	let { cssProp, value, resolvedColor, onchange }: Props = $props();

	// A var() reference is valid CSS to APPLY but opaque to a native color
	// input — show the resolved computed color instead.
	const colorValue = $derived.by(() => {
		const raw = value ?? cssProp.default ?? '';
		if (raw.startsWith('var(')) return resolvedColor ?? '#000000';
		return raw || '#000000';
	});

	const controlType = $derived.by(() => {
		const t = cssProp.type?.toLowerCase() ?? '';
		if (t === 'color') return 'color';
		if (t === 'dimension') return 'dimension';
		return 'text';
	});
</script>

{#if controlType === 'color'}
	<ColorControl value={colorValue} {onchange} />
{:else if controlType === 'dimension'}
	<DimensionControl value={value ?? cssProp.default ?? '0px'} {onchange} />
{:else}
	<TextControl value={value ?? cssProp.default ?? ''} {onchange} />
{/if}
