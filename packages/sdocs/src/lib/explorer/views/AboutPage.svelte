<script lang="ts">
	import type { DocEntry } from '../../types.js';
	import { Icon } from '../../ui/Icon/index.js';

	interface Props {
		docs: DocEntry[];
		title: string;
		logo?: string | false;
		/** Version of the sdocs that built this site */
		sdocsVersion?: string;
	}

	let { docs, title, logo = 'sdocs', sdocsVersion }: Props = $props();

	const componentCount = $derived(docs.filter((d) => d.kind === 'component').length);
	const pageCount = $derived(docs.filter((d) => d.kind === 'doc' || d.kind === 'page').length);
	const layoutCount = $derived(docs.filter((d) => d.kind === 'layout').length);
</script>

<div class="sdocs-home">
	<div class="sdocs-home-brand">
		{#if logo === 'sdocs'}
			<Icon name="sdocs" --w="160px" --h="160px" --fill="#FC1D29" />
		{:else if logo}
			<img class="sdocs-home-logo-img" src={logo} alt="" />
		{/if}
		<h1 class="sdocs-home-logo">{title}</h1>
		<p class="sdocs-home-tagline">A lightweight documentation tool for Svelte 5 components.</p>
	</div>

	<div class="sdocs-home-stats">
		{#if componentCount > 0}
			<div class="sdocs-stat">
				<span class="sdocs-stat-value">{componentCount}</span>
				<span class="sdocs-stat-label">{componentCount === 1 ? 'Component' : 'Components'}</span>
			</div>
		{/if}
		{#if pageCount > 0}
			<div class="sdocs-stat">
				<span class="sdocs-stat-value">{pageCount}</span>
				<span class="sdocs-stat-label">{pageCount === 1 ? 'Page' : 'Pages'}</span>
			</div>
		{/if}
		{#if layoutCount > 0}
			<div class="sdocs-stat">
				<span class="sdocs-stat-value">{layoutCount}</span>
				<span class="sdocs-stat-label">{layoutCount === 1 ? 'Layout' : 'Layouts'}</span>
			</div>
		{/if}
	</div>

	<p class="sdocs-home-hint">
		Built with
		<a class="sdocs-home-link" href="https://github.com/gabilungu/sdocs">sdocs</a>{#if sdocsVersion}
			<span class="sdocs-home-version">v{sdocsVersion}</span>{/if}.
	</p>
</div>

<style>
	.sdocs-home {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: 400px;
		gap: 32px;
		padding: 24px;
		box-sizing: border-box;
		font-family: var(--sans);
	}
	.sdocs-home-brand {
		text-align: center;
	}
	.sdocs-home-logo {
		font-size: 36px;
		font-weight: 700;
		color: var(--color-base-900);
		margin: 0;
	}
	.sdocs-home-logo-img {
		width: 160px;
		height: 160px;
		object-fit: contain;
	}
	.sdocs-home-tagline {
		font-size: 16px;
		color: var(--color-base-500);
		margin: 8px 0 0;
	}
	.sdocs-home-stats {
		display: flex;
		gap: 32px;
	}
	.sdocs-stat {
		text-align: center;
	}
	.sdocs-stat-value {
		display: block;
		font-size: 28px;
		font-weight: 700;
		color: var(--color-action-500);
	}
	.sdocs-stat-label {
		font-size: 13px;
		color: var(--color-base-400);
	}
	.sdocs-home-hint {
		font-size: 14px;
		color: var(--color-base-400);
	}
	.sdocs-home-link {
		color: var(--color-action-500);
		text-decoration: none;
	}
	.sdocs-home-link:hover {
		text-decoration: underline;
	}
	.sdocs-home-version {
		font-family: var(--mono);
		font-size: 13px;
		margin-left: 4px;
	}

	@media (max-width: 860px) {
		.sdocs-home {
			gap: 24px;
			min-height: 0;
		}
		/* The 160px mascot and a 36px wordmark crowd out the stats below. The
		   sizes arrive as --w/--h on a wrapper, so re-declaring them on the
		   icon itself is what takes precedence. */
		.sdocs-home :global(.Icon) {
			--w: 108px;
			--h: 108px;
		}
		.sdocs-home-logo-img {
			width: 108px;
			height: 108px;
		}
		.sdocs-home-logo {
			font-size: 28px;
		}
		.sdocs-home-stats {
			flex-wrap: wrap;
			justify-content: center;
			gap: 24px;
		}
	}
</style>
