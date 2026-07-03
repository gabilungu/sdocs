<script lang="ts">
	interface Props {
		/** Field label shown above the input */
		label: string;
		/** Placeholder shown when empty */
		placeholder?: string;
		/** Disables the input */
		disabled?: boolean;
		/** Maximum number of characters */
		maxlength?: number;
		/** Called on every keystroke with the current value */
		oninput?: (value: string) => void;
		/** Called when the value is committed (blur) */
		onchange?: (value: string) => void;
	}

	let {
		label,
		placeholder = '',
		disabled = false,
		maxlength = 60,
		oninput,
		onchange
	}: Props = $props();

	let input: HTMLInputElement;
	let value = $state('');

	/** Live input stats: current length and characters remaining */
	export const stats = $state({ length: 0, remaining: 0 });

	$effect(() => {
		stats.length = value.length;
		stats.remaining = maxlength - value.length;
	});

	/** Focus the input */
	export function focus(): void {
		input.focus();
	}

	/** Clear the value and refocus */
	export function clear(): void {
		value = '';
		input.focus();
	}
</script>

<label class="text-field" class:disabled>
	<span class="label">{label}</span>
	<input
		bind:this={input}
		bind:value
		type="text"
		{placeholder}
		{disabled}
		{maxlength}
		oninput={() => oninput?.(value)}
		onchange={() => onchange?.(value)}
	/>
	<span class="count">{value.length}/{maxlength}</span>
</label>

<style>
	.text-field {
		display: inline-flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 16rem;
	}

	.label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text, hsl(240 6% 10%));
	}

	input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border, hsl(240 6% 90%));
		border-radius: 8px;
		font: inherit;
		color: inherit;
		background: transparent;
	}

	input:focus {
		outline: 2px solid var(--field-accent, hsl(221 83% 53%));
		outline-offset: -1px;
	}

	.count {
		align-self: flex-end;
		font-size: 0.75rem;
		color: var(--text-soft, hsl(240 4% 46%));
	}

	.disabled {
		opacity: 0.5;
	}
</style>
