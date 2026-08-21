<script lang="ts">
	interface Props {
		/** Whatever was thrown or rejected with. */
		error: unknown;
		/** Whether the chunk never arrived, or arrived and threw on render. */
		kind: 'load' | 'render';
		/** The page this belongs to, when there is a name worth showing. */
		title?: string;
	}

	let { error, kind, title }: Props = $props();

	const detail = $derived.by(() => {
		const e = error as { stack?: string; message?: string } | null;
		return e?.stack || e?.message || String(error);
	});
</script>

<!--
	What a reader sees when a page's content module fails.

	Both halves used to be silent: a rejected import left `{#if PageComponent}`
	with nothing to render, and a throw during render took the same route. The
	page kept its title, its sidebar and its table of contents, and the content
	column was simply empty — the only trace was an unhandled rejection in a
	console nobody had open.
-->
<div class="sdocs-content-error" role="alert">
	<strong class="sdocs-content-error-title">
		{kind === 'load'
			? "This page's content failed to load"
			: "This page's content threw while rendering"}
	</strong>
	{#if title}
		<div class="sdocs-content-error-where">{title}</div>
	{/if}
	<pre class="sdocs-content-error-detail">{detail}</pre>
</div>

<style>
	.sdocs-content-error {
		margin: 16px 0;
		padding: 14px 16px;
		border: 1px solid var(--color-red-200, #f3b9b8);
		border-left: 3px solid var(--color-red-500, #d42c29);
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-red-500, #d42c29) 4%, transparent);
		font-family: var(--sans);
	}
	.sdocs-content-error-title {
		display: block;
		font-size: 14px;
		color: var(--color-red-600, #b02220);
	}
	.sdocs-content-error-where {
		margin-top: 4px;
		font-size: 12px;
		color: var(--color-base-500);
	}
	.sdocs-content-error-detail {
		margin: 10px 0 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-family: var(--mono);
		font-size: 12px;
		line-height: 1.5;
		color: var(--color-base-700);
	}
</style>
