import { renderMarkdown } from '$lib/server/markdown';
import type { PageServerLoad } from './$types';

const EXAMPLE = `\`\`\`svelte
<script lang="ts">
  import Button from './Button.svelte';

  export const meta = {
    component: Button,
    title: 'Components / Button',
    description: 'A flexible button.',
    args: { label: 'Click me', disabled: false },
  };
</script>

{#snippet Default(args)}
  <Button {...args} />
{/snippet}
\`\`\``;

export const load: PageServerLoad = async () => {
	const { html } = await renderMarkdown(EXAMPLE);
	return { example: html };
};
