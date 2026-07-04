import { renderMarkdown } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

const EXAMPLE = `\`\`\`sdoc
<script lang="ts">
  import Button from './Button.svelte';
</script>

[DOCS title="Components / Button" description="A flexible button."]

	[preview component={Button} args={{ label: 'Click me', disabled: false }}]
		<Button {...args} />
	[/preview]

	[example title="Disabled"]
		<Button label="Can't touch this" disabled />
	[/example]

[/DOCS]
\`\`\``;

export const load: PageServerLoad = async () => {
	const { html } = await renderMarkdown(EXAMPLE);
	return { example: html };
};
