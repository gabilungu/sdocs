<script lang="ts">
	import type { ParsedProp } from '../../types.js';
	import { Text as TextControl, Number as NumberControl, Checkbox as CheckboxControl, Select as SelectControl } from '../../ui/Control/index.js';
	import { unionOptions } from './format.js';

	interface Props {
		prop: ParsedProp;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { prop, value, onchange }: Props = $props();

	const controlType = $derived.by(() => {
		const t = prop.type?.toLowerCase() ?? '';
		if (t === 'string') return 'text';
		if (t === 'number') return 'number';
		if (t === 'boolean') return 'boolean';
		if (unionOptions(prop.type)) return 'select';
		// A type that permits a string (e.g. `number | string`) → free-text box,
		// rather than no control at all.
		if (/\bstring\b/.test(t)) return 'text';
		return 'readonly';
	});

	const options = $derived(unionOptions(prop.type) ?? []);

	// When the type also allows a number (e.g. `number | string`), coerce a
	// plain-numeric entry to a number so a "number means px"-style convention
	// still works through the text box; anything else passes through as text.
	const coercesNumber = $derived(/\bnumber\b/.test(prop.type?.toLowerCase() ?? ''));
	function onText(v: unknown) {
		if (coercesNumber && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
			onchange(Number(v));
		} else {
			onchange(v);
		}
	}
</script>

{#if controlType === 'text'}
	<TextControl value={String(value ?? prop.default ?? '')} onchange={onText} />
{:else if controlType === 'number'}
	<NumberControl value={Number(value ?? prop.default ?? 0)} {onchange} />
{:else if controlType === 'boolean'}
	<CheckboxControl value={Boolean(value ?? (prop.default === 'true'))} {onchange} />
{:else if controlType === 'select'}
	<!-- No default and nothing set → a "Please select…" placeholder, so an
	     unset enum prop reads as unset instead of silently showing option one. -->
	<SelectControl value={String(value ?? prop.default ?? '')} {options} placeholder="Please select…" {onchange} />
{:else}
	<span class="sdocs-control-unsupported">—</span>
{/if}

<style>
	.sdocs-control-unsupported {
		color: var(--color-base-300);
	}
</style>
