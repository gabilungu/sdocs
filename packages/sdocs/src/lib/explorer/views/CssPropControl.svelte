<script lang="ts">
	import type { ParsedCssProp } from '../../types.js';
	import { Text as TextControl, Color as ColorControl, Dimension as DimensionControl } from '../../ui/Control/index.js';

	interface Props {
		cssProp: ParsedCssProp;
		value: string | undefined;
		onchange: (value: string) => void;
	}

	let { cssProp, value, onchange }: Props = $props();

	const controlType = $derived.by(() => {
		const t = cssProp.type?.toLowerCase() ?? '';
		if (t === 'color') return 'color';
		if (t === 'dimension') return 'dimension';
		return 'text';
	});
</script>

{#if controlType === 'color'}
	<ColorControl value={value ?? cssProp.default ?? '#000000'} {onchange} />
{:else if controlType === 'dimension'}
	<DimensionControl value={value ?? cssProp.default ?? '0px'} {onchange} />
{:else}
	<TextControl value={value ?? cssProp.default ?? ''} {onchange} />
{/if}
