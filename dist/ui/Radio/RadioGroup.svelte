<script lang="ts">
	import Radio from './Radio.svelte';

	interface RadioOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	/**
	 * A managed group of radio buttons with built-in state handling and layout options.
	 */
	interface Props {
		/** Array of options to display */
		options: RadioOption[] | string[];
		/** Currently selected value */
		value?: string;
		/** Group name */
		name?: string;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Disable all radios */
		disabled?: boolean;
		/** Layout direction */
		direction?: 'horizontal' | 'vertical';
		/** Callback when selection changes */
		onchange?: (value: string) => void;
	}

	let {
		options,
		value = '',
		name,
		size = 'm',
		disabled = false,
		direction = 'vertical',
		onchange
	}: Props = $props();

	let selectedValue = $state(value);

	// Sync with external changes
	$effect(() => {
		selectedValue = value;
	});

	// Normalize options to RadioOption format
	let normalizedOptions = $derived(
		options.map((opt) =>
			typeof opt === 'string' ? { value: opt, label: opt } : opt
		)
	);

	function handleChange(newValue: string) {
		selectedValue = newValue;
		onchange?.(newValue);
	}

	// Gap based on size
	const gaps = {
		xs: '8px',
		s: '10px',
		m: '12px',
		l: '14px'
	};
</script>

<div
	class="RadioGroup"
	class:horizontal={direction === 'horizontal'}
	role="radiogroup"
	style="--gap: {gaps[size]};"
>
	{#each normalizedOptions as option (option.value)}
		<Radio
			value={option.value}
			label={option.label}
			{name}
			{size}
			checked={selectedValue === option.value}
			disabled={disabled || option.disabled}
			onchange={handleChange}
		/>
	{/each}
</div>

<style>
	.RadioGroup {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.RadioGroup.horizontal {
		flex-direction: row;
		flex-wrap: wrap;
	}
</style>
