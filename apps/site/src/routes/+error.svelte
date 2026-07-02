<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} • sdocs</title>
</svelte:head>

<section>
	<h1>{page.status}</h1>
	<p>{page.error?.message ?? 'Something went wrong.'}</p>
	<a href="{base}/">Back to the home page</a>
</section>

<style>
	section {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 4rem 1.5rem;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: 3rem;
	}

	p {
		margin: 0;
		color: var(--text-soft);
	}
</style>
