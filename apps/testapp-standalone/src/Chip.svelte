<script>
	import clsx from 'clsx';

	/**
	 * @typedef {Object} Props
	 * @property {string} [label] - Chip text
	 * @property {boolean} [active] - Highlighted state
	 * @property {() => void} [onremove] - Called when the remove button is clicked
	 */

	/** @type {Props} */
	let { label = 'Chip', active = false, onremove } = $props();
</script>

<span class={clsx('chip', { active })}>
	{label}
	{#if onremove}
		<button onclick={onremove} aria-label="Remove">×</button>
	{/if}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--gap, 4px);
		padding: var(--padding, 2px 10px);
		border-radius: 999px;
		background: #e5e7eb;
		font-size: 13px;
	}

	.active {
		background: #bfdbfe;
	}

	button {
		border: none;
		background: none;
		cursor: pointer;
		padding: 0;
		font-size: 14px;
		color: #6b7280;
	}
</style>
