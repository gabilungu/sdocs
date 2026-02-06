<script lang="ts">
	/**
	 * A native radio input with customizable styling. Use the name prop to group radios together.
	 */
	interface Props {
		/** Whether this radio is selected */
		checked?: boolean;
		/** The value of this radio */
		value: string;
		/** Label text */
		label?: string;
		/** Group name (for native radio behavior) */
		name?: string;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Disable the radio */
		disabled?: boolean;
		/** Callback when selected */
		onchange?: (value: string) => void;
	}

	let {
		checked = false,
		value,
		label,
		name,
		size = 'm',
		disabled = false,
		onchange
	}: Props = $props();

	function handleChange() {
		onchange?.(value);
	}

	// Make checked reactive
	let isChecked = $derived(checked);

	// Size-based dimensions
	const sizes = {
		xs: { box: 14, dot: 6, gap: 6 },
		s: { box: 16, dot: 7, gap: 8 },
		m: { box: 18, dot: 8, gap: 8 },
		l: { box: 22, dot: 10, gap: 10 }
	};

	let sizeConfig = $derived(sizes[size]);
</script>

<label
	class="Radio {size}"
	class:disabled
	style="--box-size: {sizeConfig.box}px; --dot-size: {sizeConfig.dot}px; --gap: {sizeConfig.gap}px;"
>
	<input
		type="radio"
		{name}
		{value}
		{disabled}
		checked={isChecked}
		onchange={handleChange}
		class="Radio-input"
	/>
	<span class="Radio-box">
		<span class="Radio-dot"></span>
	</span>
	{#if label}
		<span class="Radio-label">{label}</span>
	{/if}
</label>

<style>
	.Radio {
		display: inline-flex;
		align-items: center;
		gap: var(--gap);
		cursor: pointer;
		font-family: var(--font-sans);
		color: var(--color-text);
		transition: opacity 0.15s ease;
	}

	.Radio.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.Radio-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	.Radio-box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--box-size);
		height: var(--box-size);
		border-radius: 50%;
		border: 1.5px solid var(--base-300);
		background: var(--base-0);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.Radio:not(.disabled):hover .Radio-box {
		border-color: var(--base-400);
		background: var(--base-50);
	}

	.Radio-input:focus-visible + .Radio-box {
		box-shadow: 0 0 0 2px var(--action-200);
	}

	.Radio-input:checked + .Radio-box {
		border-color: var(--action-500);
	}

	.Radio:not(.disabled):hover .Radio-input:checked + .Radio-box {
		border-color: var(--action-600);
	}

	.Radio-dot {
		width: var(--dot-size);
		height: var(--dot-size);
		border-radius: 50%;
		background: var(--action-500);
		opacity: 0;
		transform: scale(0);
		transition: all 0.15s ease;
	}

	.Radio-input:checked + .Radio-box .Radio-dot {
		opacity: 1;
		transform: scale(1);
	}

	.Radio:not(.disabled):hover .Radio-input:checked + .Radio-box .Radio-dot {
		background: var(--action-600);
	}

	.Radio-label {
		user-select: none;
	}

	/* Size-specific label font sizes */
	.xs .Radio-label {
		font-size: 11px;
	}

	.s .Radio-label {
		font-size: 12px;
	}

	.m .Radio-label {
		font-size: 13px;
	}

	.l .Radio-label {
		font-size: 14px;
	}
</style>
