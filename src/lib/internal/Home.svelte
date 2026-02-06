<script lang="ts">
	interface Props {
		/** Total number of documented components */
		componentCount?: number;
		/** Total number of documentation pages */
		pageCount?: number;
	}

	let { componentCount = 0, pageCount = 0 }: Props = $props();
</script>

<div class="Home">
	<h1 class="Home-title">sdocs</h1>
	<p class="Home-tagline">A lightweight documentation tool for Svelte 5 components.</p>

	<div class="Home-stats">
		{#if componentCount > 0}
			<div class="Home-stat">
				<span class="Home-stat-value">{componentCount}</span>
				<span class="Home-stat-label">{componentCount === 1 ? 'Component' : 'Components'}</span>
			</div>
		{/if}
		{#if pageCount > 0}
			<div class="Home-stat">
				<span class="Home-stat-value">{pageCount}</span>
				<span class="Home-stat-label">{pageCount === 1 ? 'Page' : 'Pages'}</span>
			</div>
		{/if}
	</div>

	<p class="Home-hint">Select a component or page from the sidebar to get started.</p>
</div>

<style>
	.Home {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		min-height: 60vh;
		padding: 48px;
	}

	.Home-title {
		font-size: 48px;
		font-weight: 800;
		margin: 0 0 12px;
		color: var(--color-text);
		letter-spacing: -0.03em;
	}

	.Home-tagline {
		font-size: 18px;
		color: var(--color-text-secondary);
		margin: 0 0 40px;
		max-width: 400px;
		line-height: 1.5;
	}

	.Home-stats {
		display: flex;
		gap: 48px;
		margin-bottom: 40px;
	}

	.Home-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.Home-stat-value {
		font-size: 36px;
		font-weight: 700;
		color: var(--color-primary);
	}

	.Home-stat-label {
		font-size: 14px;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.Home-hint {
		font-size: 14px;
		color: var(--color-text-muted);
		margin: 0;
	}
</style>
