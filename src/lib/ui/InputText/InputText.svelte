<script lang="ts">
	/**
	 * A text input field with size variants and event callbacks.
	 */
	interface Props {
		/** Input value */
		value?: string;
		/** Placeholder text */
		placeholder?: string;
		/** Callback when value changes */
		onchange?: (value: string) => void;
		/** Callback on input */
		oninput?: (value: string) => void;
		/** Size variant */
		size?: 'xs' | 's' | 'm' | 'l';
		/** Disable the input */
		disabled?: boolean;
		/** Input type */
		type?: 'text' | 'email' | 'password';
	}

	let {
		value = '',
		placeholder = '',
		onchange,
		oninput,
		size = 'm',
		disabled = false,
		type = 'text'
	}: Props = $props();

	// Internal state - sync with prop
	let inputValue = $state(value);
	$effect(() => {
		inputValue = value;
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		inputValue = target.value;
		oninput?.(inputValue);
	}

	function handleChange(e: Event) {
		const target = e.target as HTMLInputElement;
		inputValue = target.value;
		onchange?.(inputValue);
	}
</script>

<input
	class="InputText {size}"
	{type}
	value={inputValue}
	{placeholder}
	{disabled}
	oninput={handleInput}
	onchange={handleChange}
/>

<style>
	.InputText {
		font-family: var(--font-sans);
		font-weight: 400;
		border: none;
		background: var(--base-100);
		color: var(--color-text);
		border-radius: 6px;
		transition: all 0.15s ease;
		outline: none;
		width: 100%;
	}

	.InputText::placeholder {
		color: var(--base-400);
	}

	.InputText:hover:not(:disabled) {
		background: var(--base-50);
	}

	.InputText:focus {
		background: var(--base-50);
		box-shadow: 0 0 0 2px var(--action-200);
	}

	.InputText:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Size variants - heights: xs=24px, s=28px, m=32px, l=40px */
	.xs {
		height: 24px;
		padding: 0 8px;
		font-size: 11px;
	}

	.s {
		height: 28px;
		padding: 0 10px;
		font-size: 12px;
	}

	.m {
		height: 32px;
		padding: 0 12px;
		font-size: 13px;
	}

	.l {
		height: 40px;
		padding: 0 16px;
		font-size: 14px;
	}
</style>
