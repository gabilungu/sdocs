<script lang="ts">
	import Explorer from 'sdocs/explorer';
	import { docs, cssNames, pageModules } from 'virtual:sdocs';
</script>

<svelte:head>
	<title>testapp docs</title>
</svelte:head>

<Explorer
	{docs}
	{cssNames}
	{pageModules}
	title="testapp"
	sidebarConfig={{
		order: { root: ['UI', '*'] },
		open: ['UI']
	}}
/>
