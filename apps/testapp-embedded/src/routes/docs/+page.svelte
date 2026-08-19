<script lang="ts">
	import Explorer from 'sdocs/explorer';
	import { docs, cssNames, axes, scale, pageModules } from 'virtual:sdocs';
</script>

<svelte:head>
	<title>testapp docs</title>
</svelte:head>

<Explorer
	{docs}
	{cssNames}
	{axes}
	{scale}
	{pageModules}
	title="testapp"
	sidebarConfig={{
		order: { root: ['UI', '*'] },
		open: ['UI']
	}}
/>
