<!--
	A body that compiles to its own Svelte component — a `[DOC]`'s content or a
	`[SHOWCASE]`'s `[PROSE]` block — loaded by key from `virtual:sdocs`.

	Prerendering resolves these ahead of time (effects never run server-side),
	so a preloaded component is used as-is and the import only runs in the
	browser, for the route the reader is actually on.
-->
<script lang="ts">
	import type { Component } from 'svelte';
	import ContentError from './ContentError.svelte';
	import { usePageModule, type PageModules } from '../page-module.svelte.js';

	interface Props {
		/** Key into `pageModules` / `preloaded`; nothing renders without one. */
		key?: string;
		pageModules?: PageModules;
		preloaded?: Record<string, Component>;
	}

	let { key, pageModules = {}, preloaded = {} }: Props = $props();

	const body = usePageModule(
		() => key,
		() => pageModules,
		() => preloaded,
		'prose block',
	);
	const Body = $derived(body.component);
</script>

{#if Body}
	<svelte:boundary>
		<Body />
		{#snippet failed(error)}
			<ContentError {error} kind="render" />
		{/snippet}
	</svelte:boundary>
{:else if body.error}
	<ContentError error={body.error} kind="load" />
{/if}
