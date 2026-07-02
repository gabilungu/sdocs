<script>
	/**
	 * @typedef {Object} Props
	 * @property {string} [label] - Badge text
	 * @property {'info' | 'success' | 'warning'} [tone] - Color tone
	 * @property {boolean} [pill] - Fully rounded corners
	 * @property {() => void} [ondismiss] - Called when the badge is dismissed
	 */

	/** @type {Props} */
	let { label = 'Badge', tone = 'info', pill = false, ondismiss } = $props();

	const colors = {
		info: '#3b82f6',
		success: '#22c55e',
		warning: '#f59e0b',
	};
</script>

<span class="badge" class:pill style="background: {colors[tone]}">
	{label}
	{#if ondismiss}
		<button onclick={ondismiss} aria-label="Dismiss">×</button>
	{/if}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--gap, 4px);
		padding: var(--padding, 2px 8px);
		border-radius: 4px;
		color: white;
		font-size: 12px;
		font-weight: 600;
	}

	.pill {
		border-radius: 999px;
	}

	button {
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		padding: 0;
		font-size: 13px;
	}
</style>
