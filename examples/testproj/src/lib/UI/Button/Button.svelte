<script lang="ts">
	interface Props {
		/** Button label text */
		label?: string;
		/** Visual style variant */
		variant?: 'primary' | 'secondary' | 'ghost';
		/** Button size */
		size?: 'sm' | 'md' | 'lg';
		/** Disabled state */
		disabled?: boolean;
		/** Click handler */
		onclick?: () => void;
	}

	let { label = 'Button', variant = 'primary', size = 'md', disabled = false, onclick }: Props = $props();
</script>

<button class="btn {variant} {size}" {disabled} {onclick}>
	{label}
</button>

<style>
	.btn {
		border: none;
		border-radius: var(--btn-radius, 6px);
		cursor: pointer;
		font-family: inherit;
		font-weight: 500;
		transition: opacity 0.15s;
	}

	.btn:hover:not(:disabled) {
		opacity: 0.85;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sm {
		padding: 4px 10px;
		font-size: 13px;
	}
	.md {
		padding: 8px 16px;
		font-size: 15px;
	}
	.lg {
		padding: 12px 24px;
		font-size: 17px;
	}

	.primary {
		background: #3b82f6;
		color: white;
	}
	.secondary {
		background: #e5e7eb;
		color: #1f2937;
	}
	.ghost {
		background: transparent;
		color: #3b82f6;
	}
</style>
