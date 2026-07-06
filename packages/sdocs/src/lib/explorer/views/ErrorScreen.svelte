<script lang="ts">
	import type { SiteError } from '../tree-builder.js';

	interface Props {
		errors: SiteError[];
	}

	let { errors }: Props = $props();
</script>

<div class="sdocs-errors">
	<div class="sdocs-errors-panel">
		<h1 class="sdocs-errors-title">
			{errors.length === 1 ? 'Site structure error' : `${errors.length} site structure errors`}
		</h1>
		<p class="sdocs-errors-hint">
			The site can't be assembled until these are fixed — nothing else renders, and
			<code>sdocs build</code> fails on them.
		</p>
		<ul class="sdocs-errors-list">
			{#each errors as error, i (i)}
				<li class="sdocs-error">
					<p class="sdocs-error-message">{error.message}</p>
					{#if error.file}
						<p class="sdocs-error-file">{error.file}</p>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
	.sdocs-errors {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		min-height: 100%;
		padding: 48px 24px;
		background: var(--color-base-0);
		font-family: var(--sans);
	}
	.sdocs-errors-panel {
		max-width: 760px;
		width: 100%;
	}
	.sdocs-errors-title {
		font-size: 22px;
		font-weight: 700;
		color: var(--color-red-500, #d42c29);
		margin: 0 0 8px;
	}
	.sdocs-errors-hint {
		font-size: 14px;
		color: var(--color-base-500);
		margin: 0 0 24px;
	}
	.sdocs-errors-hint code {
		font-family: var(--mono);
		font-size: 0.92em;
	}
	.sdocs-errors-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sdocs-error {
		border: 1px solid var(--color-red-200, #f3b9b8);
		border-left: 3px solid var(--color-red-500, #d42c29);
		border-radius: 6px;
		padding: 12px 16px;
		background: color-mix(in srgb, var(--color-red-500, #d42c29) 4%, transparent);
	}
	.sdocs-error-message {
		font-size: 14px;
		color: var(--color-base-900);
		margin: 0;
	}
	.sdocs-error-file {
		font-family: var(--mono);
		font-size: 12px;
		color: var(--color-base-500);
		margin: 6px 0 0;
	}
</style>
