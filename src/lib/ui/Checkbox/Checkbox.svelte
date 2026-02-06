<script lang="ts">
	/**
	 * A customizable checkbox component with support for labels, sizes, and disabled states.
	 */
	interface Props {
		/** Whether the checkbox is checked */
		checked?: boolean;
		/** Label text */
		label?: string;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Disable the checkbox */
		disabled?: boolean;
		/** Callback when checked state changes */
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = false,
		label,
		size = 'm',
		disabled = false,
		onchange
	}: Props = $props();

	let isChecked = $state(checked);

	// Sync with external changes
	$effect(() => {
		isChecked = checked;
	});

	function handleClick() {
		if (disabled) return;
		isChecked = !isChecked;
		onchange?.(isChecked);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			handleClick();
		}
	}

	// Size-based dimensions (matching Radio pattern)
	const sizes = {
		xs: { box: 14, mark: 6, gap: 6 },
		s: { box: 16, mark: 7, gap: 8 },
		m: { box: 18, mark: 8, gap: 8 },
		l: { box: 22, mark: 10, gap: 10 }
	};

	let sizeConfig = $derived(sizes[size]);
</script>

<button
	type="button"
	class="Checkbox {size}"
	class:checked={isChecked}
	class:disabled
	{disabled}
	role="checkbox"
	aria-checked={isChecked}
	onclick={handleClick}
	onkeydown={handleKeyDown}
	style="--box-size: {sizeConfig.box}px; --mark-size: {sizeConfig.mark}px; --gap: {sizeConfig.gap}px;"
>
	<span class="Checkbox-box">
		<span class="Checkbox-mark"></span>
	</span>
	{#if label}
		<span class="Checkbox-label">{label}</span>
	{/if}
</button>

<style>
	.Checkbox {
		display: inline-flex;
		align-items: center;
		gap: var(--gap);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: var(--font-sans);
		color: var(--color-text);
		transition: opacity 0.15s ease;
	}

	.Checkbox:focus-visible {
		outline: none;
	}

	.Checkbox:focus-visible .Checkbox-box {
		box-shadow: 0 0 0 2px var(--action-200);
	}

	.Checkbox.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.Checkbox-box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--box-size);
		height: var(--box-size);
		border-radius: 4px;
		border: 1.5px solid var(--base-300);
		background: var(--base-0);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.Checkbox:not(.disabled):hover .Checkbox-box {
		border-color: var(--base-400);
		background: var(--base-50);
	}

	.Checkbox.checked .Checkbox-box {
		border-color: var(--action-500);
	}

	.Checkbox.checked:not(.disabled):hover .Checkbox-box {
		border-color: var(--action-600);
	}

	.Checkbox-mark {
		width: var(--mark-size);
		height: var(--mark-size);
		border-radius: 2px;
		background: var(--action-500);
		opacity: 0;
		transform: scale(0);
		transition: all 0.15s ease;
	}

	.Checkbox.checked .Checkbox-mark {
		opacity: 1;
		transform: scale(1);
	}

	.Checkbox.checked:not(.disabled):hover .Checkbox-mark {
		background: var(--action-600);
	}

	.Checkbox-label {
		user-select: none;
	}

	/* Size-specific label font sizes */
	.xs .Checkbox-label {
		font-size: 11px;
	}

	.s .Checkbox-label {
		font-size: 12px;
	}

	.m .Checkbox-label {
		font-size: 13px;
	}

	.l .Checkbox-label {
		font-size: 14px;
	}
</style>
