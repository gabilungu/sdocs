<script lang="ts">
	import type { ParsedProp } from '../../types.js';
	import { Text as TextControl, Number as NumberControl, Checkbox as CheckboxControl, Select as SelectControl } from '../../ui/Control/index.js';

	interface Props {
		prop: ParsedProp;
		value: unknown;
		onchange: (value: unknown) => void;
	}

	let { prop, value, onchange }: Props = $props();

	/** Parse union type strings like "'sm' | 'md' | 'lg'" or "1 | 2 | 3" into option arrays */
	function parseUnionOptions(type: string | null): string[] | null {
		if (!type || !type.includes('|')) return null;
		const parts = type.split('|').map((s) => s.trim());
		const values: string[] = [];
		let allStrings = true;
		let allNumbers = true;
		for (const part of parts) {
			// Quoted string: 'value' or "value"
			const strMatch = part.match(/^['"](.+)['"]$/);
			if (strMatch) {
				values.push(strMatch[1]);
				allNumbers = false;
				continue;
			}
			// Bare number: 1, 2, 3
			if (/^\d+(\.\d+)?$/.test(part)) {
				values.push(part);
				allStrings = false;
				continue;
			}
			// Mixed or unsupported (e.g. 'medium' | number) → null
			return null;
		}
		if (values.length > 0 && (allStrings || allNumbers)) return values;
		return null;
	}

	const controlType = $derived.by(() => {
		const t = prop.type?.toLowerCase() ?? '';
		if (t === 'string') return 'text';
		if (t === 'number') return 'number';
		if (t === 'boolean') return 'boolean';
		if (parseUnionOptions(prop.type)) return 'select';
		// A type that permits a string (e.g. `number | string`) → free-text box,
		// rather than no control at all.
		if (/\bstring\b/.test(t)) return 'text';
		return 'readonly';
	});

	const options = $derived(parseUnionOptions(prop.type) ?? []);

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
	<SelectControl value={String(value ?? prop.default ?? options[0] ?? '')} {options} {onchange} />
{:else}
	<span class="sdocs-control-unsupported">—</span>
{/if}

<style>
	.sdocs-control-unsupported {
		color: var(--color-base-300);
	}
</style>
