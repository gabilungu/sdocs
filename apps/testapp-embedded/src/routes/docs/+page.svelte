<script lang="ts">
	import Explorer from 'sdocs/explorer';
	import { docs, cssNames } from 'virtual:sdocs';
</script>

<svelte:head>
	<title>testapp docs</title>
</svelte:head>

<Explorer
	{docs}
	{cssNames}
	logo="testapp"
	sidebarConfig={{
		order: { root: ['UI', '*'] },
		open: ['UI']
	}}
/>
