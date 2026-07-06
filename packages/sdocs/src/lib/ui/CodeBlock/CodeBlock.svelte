<script lang="ts">
	import { highlightCode } from '../../explorer/highlighter.js';

	interface Props {
		/** The source code to display */
		code: string;
		/** Highlight language: any bundled shiki language, plus 'sdoc' itself.
		 * Unknown names render as plaintext. */
		lang?: string;
	}

	let { code, lang = 'svelte' }: Props = $props();

	let html = $state('');

	$effect(() => {
		let stale = false;
		highlightCode(code, lang).then((out) => {
			if (!stale) html = out;
		});
		return () => {
			stale = true;
		};
	});
</script>

<div class="sdocs-codeblock">
	{#if html}
		{@html html}
	{:else}
		<pre>{code}</pre>
	{/if}
</div>

<style>
	.sdocs-codeblock {
		overflow-x: auto;
		font-size: 13px;
		line-height: 1.5;
		tab-size: 4;
	}
	.sdocs-codeblock :global(pre) {
		margin: 0;
		padding: 12px;
		border-radius: 6px;
		overflow-x: auto;
	}
	.sdocs-codeblock :global(code),
	.sdocs-codeblock pre {
		font-family: var(--mono, ui-monospace, monospace);
	}
	/* Plain fallback while the highlighter loads: same metrics, muted colors */
	.sdocs-codeblock > pre {
		background: var(--color-base-100, #f4f4f5);
		color: var(--color-base-800, #27272a);
	}
</style>
