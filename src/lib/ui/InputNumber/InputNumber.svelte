<script lang="ts">
	/**
	 * A number input field with custom stepper buttons and size variants.
	 */
	interface Props {
		/** Input value */
		value?: number;
		/** Minimum value */
		min?: number;
		/** Maximum value */
		max?: number;
		/** Step increment */
		step?: number;
		/** Placeholder text */
		placeholder?: string;
		/** Callback when value changes */
		onchange?: (value: number) => void;
		/** Callback on input */
		oninput?: (value: number) => void;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Disable the input */
		disabled?: boolean;
	}

	let {
		value = 0,
		min,
		max,
		step = 1,
		placeholder = '',
		onchange,
		oninput,
		size = 'm',
		disabled = false
	}: Props = $props();

	// Internal state - sync with prop
	let inputValue = $state(value);
	$effect(() => {
		inputValue = value;
	});

	function clamp(val: number): number {
		if (min !== undefined && val < min) return min;
		if (max !== undefined && val > max) return max;
		return val;
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const num = parseFloat(target.value);
		if (!isNaN(num)) {
			inputValue = num;
			oninput?.(inputValue);
		}
	}

	function handleChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const num = parseFloat(target.value);
		if (!isNaN(num)) {
			inputValue = clamp(num);
			onchange?.(inputValue);
		}
	}

	function increment() {
		if (disabled) return;
		const newValue = clamp(inputValue + step);
		inputValue = newValue;
		onchange?.(newValue);
	}

	function decrement() {
		if (disabled) return;
		const newValue = clamp(inputValue - step);
		inputValue = newValue;
		onchange?.(newValue);
	}
</script>

<div class="InputNumber {size}" class:disabled>
	<input
		class="InputNumber-input"
		type="number"
		value={inputValue}
		{min}
		{max}
		{step}
		{placeholder}
		{disabled}
		oninput={handleInput}
		onchange={handleChange}
	/>
	<div class="InputNumber-steppers">
		<button
			type="button"
			class="InputNumber-stepper"
			onclick={decrement}
			{disabled}
			tabindex={-1}
			aria-label="Decrement"
		>
			<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<path d="M8 3L5 6L8 9" />
			</svg>
		</button>
		<button
			type="button"
			class="InputNumber-stepper"
			onclick={increment}
			{disabled}
			tabindex={-1}
			aria-label="Increment"
		>
			<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<path d="M4 3L7 6L4 9" />
			</svg>
		</button>
	</div>
</div>

<style>
	.InputNumber {
		position: relative;
		display: flex;
		align-items: stretch;
		width: 100%;
		background: var(--base-100);
		border-radius: 6px;
		transition: all 0.15s ease;
	}

	.InputNumber:hover:not(.disabled) {
		background: var(--base-50);
	}

	.InputNumber:focus-within {
		background: var(--base-50);
		box-shadow: 0 0 0 2px var(--action-200);
	}

	.InputNumber.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.InputNumber-input {
		flex: 1;
		font-family: var(--font-sans);
		font-weight: 400;
		border: none;
		background: transparent;
		color: var(--color-text);
		outline: none;
		min-width: 0;
	}

	.InputNumber-input::placeholder {
		color: var(--base-400);
	}

	.InputNumber-input:disabled {
		cursor: not-allowed;
	}

	/* Hide native spinner buttons */
	.InputNumber-input::-webkit-outer-spin-button,
	.InputNumber-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.InputNumber-input[type='number'] {
		-moz-appearance: textfield;
	}

	.InputNumber-steppers {
		display: flex;
		flex-direction: row;
		border-left: 1px solid var(--base-200);
	}

	.InputNumber-stepper {
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--base-400);
		cursor: pointer;
		padding: 0;
		transition: all 0.1s ease;
	}

	.InputNumber-stepper:hover:not(:disabled) {
		color: var(--color-text);
		background: var(--base-200);
	}

	.InputNumber-stepper:active:not(:disabled) {
		background: var(--base-300);
	}

	.InputNumber-stepper:disabled {
		cursor: not-allowed;
	}

	.InputNumber-stepper:first-child {
		border-right: 1px solid var(--base-200);
	}

	.InputNumber-stepper:last-child {
		border-radius: 0 6px 6px 0;
	}

	.InputNumber-stepper svg {
		width: 12px;
		height: 12px;
	}

	/* Size variants */
	.xs {
		height: 24px;
	}
	.xs .InputNumber-input {
		padding: 0 8px;
		font-size: 11px;
	}
	.xs .InputNumber-stepper {
		width: 20px;
	}
	.xs .InputNumber-stepper svg {
		width: 10px;
		height: 10px;
	}

	.s {
		height: 28px;
	}
	.s .InputNumber-input {
		padding: 0 10px;
		font-size: 12px;
	}
	.s .InputNumber-stepper {
		width: 24px;
	}

	.m {
		height: 32px;
	}
	.m .InputNumber-input {
		padding: 0 12px;
		font-size: 13px;
	}
	.m .InputNumber-stepper {
		width: 28px;
	}

	.l {
		height: 40px;
	}
	.l .InputNumber-input {
		padding: 0 16px;
		font-size: 14px;
	}
	.l .InputNumber-stepper {
		width: 34px;
	}
	.l .InputNumber-stepper svg {
		width: 14px;
		height: 14px;
	}
</style>
