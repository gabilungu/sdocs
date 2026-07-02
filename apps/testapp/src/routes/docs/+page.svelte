<script lang="ts">
	import App from 'sdocs/client';
	import { docs, cssNames } from 'virtual:sdocs';
</script>

<svelte:head>
	<title>testapp docs</title>
</svelte:head>

<App
	{docs}
	{cssNames}
	logo="testapp"
	sidebarConfig={{
		order: { root: ['UI', '*'] },
		open: ['UI']
	}}
/>
