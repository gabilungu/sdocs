<script lang="ts">
	import { Sdocs } from '$lib/index.js';

	const options = {
		sidebar: {
			order: {
				root: ['Box', 'BoxJS', 'Layout', '*', 'Demo', 'Documentation'],
				Documentation: ['About', 'Installation', 'Creating Docs', 'Props', 'CSS Props', '*', 'Specs'],
				'Documentation/Specs': ['Sidebar', '*'],
			},
			open: ['Layout', 'Demo', 'Box', 'BoxJS'],
		},
	};
</script>

<Sdocs {options} />
