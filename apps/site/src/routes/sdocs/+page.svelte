<script lang="ts">
	import { base } from '$app/paths';
	import Explorer from 'sdocs/explorer';
	import { docs, cssNames, pageModules } from 'virtual:sdocs';
</script>

<svelte:head>
	<title>Demo • sdocs</title>
	<meta name="description" content="The Explorer, documenting this site's own components." />
</svelte:head>

<div class="demo">
	<Explorer {docs} {cssNames} {pageModules} logo="sdocs site" previewBase={base} />
</div>

<style>
	.demo {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* The Explorer manages its own viewport; keep it inside the space under the header. */
	.demo :global(.sdocs-app) {
		height: calc(100dvh - var(--header-height));
	}
</style>
