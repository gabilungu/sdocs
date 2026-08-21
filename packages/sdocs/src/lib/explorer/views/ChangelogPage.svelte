<!--
	The sdocs changelog, at /changelog.

	Shipped with the build rather than fetched from GitHub: a docs site is often
	read behind a firewall or offline, and the version of the log that matches
	the version that built the site is the useful one anyway.

	Loaded on demand — it is long, it grows every release, and most readers
	never open it, so it has no business in the payload every page pays for.
-->
<script lang="ts">
	import { copyCode } from '../copy-code.svelte.js';

	interface Props {
		/** Version of the sdocs that built this site. */
		sdocsVersion?: string;
		/** `loadChangelog` from `virtual:sdocs`; absent in a host that does not
		 * pass it, where the route simply says so. */
		load?: () => Promise<{ default: string }>;
	}

	let { sdocsVersion, load }: Props = $props();

	let html = $state<string | null>(null);
	let failed = $state(false);

	$effect(() => {
		if (!load) {
			failed = true;
			return;
		}
		let stale = false;
		load()
			.then((mod) => {
				if (!stale) html = mod.default;
			})
			.catch(() => {
				if (!stale) failed = true;
			});
		return () => {
			stale = true;
		};
	});
</script>

<div class="sdocs-changelog-view">
	<header class="sdocs-changelog-head">
		<h1>Changelog</h1>
		{#if sdocsVersion}
			<p>
				This site was built with sdocs <strong>{sdocsVersion}</strong>. Everything below
				shipped in that version or before it.
			</p>
		{/if}
	</header>

	{#if html}
		<div class="sdocs-prose sdocs-changelog-body" {@attach copyCode()}>
			{@html html}
		</div>
	{:else if failed}
		<p class="sdocs-changelog-empty">This install shipped no changelog.</p>
	{:else}
		<p class="sdocs-changelog-empty">Loading…</p>
	{/if}
</div>

<style>
	.sdocs-changelog-view {
		padding: 32px;
		/* The measure does the reading width; this only stops the column
		   sprawling on a very wide screen. */
		max-width: 900px;
	}

	.sdocs-changelog-head h1 {
		margin: 0;
		font-size: 24px;
		font-weight: 700;
		color: var(--color-base-900);
	}

	.sdocs-changelog-head p {
		margin: 6px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--color-base-500);
	}

	.sdocs-changelog-body {
		margin-top: 20px;
	}

	/* Each release opens a section: a rule above it turns a long file into a
	   list of releases rather than one unbroken wall. */
	.sdocs-changelog-body :global(h2) {
		margin-top: 2em;
		padding-top: 1em;
		border-top: 1px solid var(--color-base-200);
	}

	.sdocs-changelog-empty {
		margin: 24px 0 0;
		font-size: 14px;
		color: var(--color-base-500);
	}
</style>
