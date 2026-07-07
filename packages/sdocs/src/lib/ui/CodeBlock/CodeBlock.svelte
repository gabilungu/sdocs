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
	/* Fallback before shiki loads (also what the prerendered HTML shows until
	 * hydration): match the final dark shiki stage — see the pre.shiki rule in
	 * sdocs.css — so the swap only adds syntax colors, never a light→dark flip. */
	.sdocs-codeblock > pre {
		background: #24292e; /* shiki github-dark bg */
		color: #e1e4e8; /* github-dark default foreground */
	}
</style>
