<script lang="ts">
	/**
	 * A segmented toggle control for selecting one option from a set of choices.
	 */
	interface Props {
		/** Available options */
		options: string[];
		/** Initially selected value */
		value?: string;
		/** Callback when selection changes */
		onchange?: (value: string) => void;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Disable the control */
		disabled?: boolean;
	}

	let { options, value, onchange, size = 'm', disabled = false }: Props = $props();

	// Internal state, initialized from prop
	let selected = $state(value ?? options[0]);

	function select(option: string) {
		if (disabled || option === selected) return;
		selected = option;
		onchange?.(option);
	}

	function handleKeydown(event: KeyboardEvent, option: string) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			select(option);
		}
	}
</script>

<div class="SegmentControl {size}" class:disabled role="radiogroup">
	{#each options as option (option)}
		<button
			type="button"
			class="SegmentControl-option"
			class:selected={selected === option}
			role="radio"
			aria-checked={selected === option}
			{disabled}
			onclick={() => select(option)}
			onkeydown={(e) => handleKeydown(e, option)}
		>
			{option}
		</button>
	{/each}
</div>

<style>
	.SegmentControl {
		display: inline-flex;
		background: var(--base-100);
		border-radius: 8px;
		padding: 3px;
		gap: 2px;
	}

	.SegmentControl.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.SegmentControl-option {
		font-family: var(--font-sans);
		font-weight: 500;
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: 6px;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.SegmentControl-option:hover:not(.selected):not(:disabled) {
		color: var(--color-text);
		background: var(--base-50);
	}

	.SegmentControl-option.selected {
		background: white;
		color: var(--color-text);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.SegmentControl-option:focus-visible {
		outline: 2px solid var(--action-500);
		outline-offset: 1px;
	}

	/* Size variants - heights: xs=24px, s=28px, m=32px, l=40px (minus 6px container padding) */
	.xs .SegmentControl-option {
		height: 18px;
		padding: 0 8px;
		font-size: 11px;
	}

	.s .SegmentControl-option {
		height: 22px;
		padding: 0 10px;
		font-size: 12px;
	}

	.m .SegmentControl-option {
		height: 26px;
		padding: 0 12px;
		font-size: 13px;
	}

	.l .SegmentControl-option {
		height: 34px;
		padding: 0 16px;
		font-size: 14px;
	}
</style>
