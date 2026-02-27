<script lang="ts" module>
	import CodeBlock from './CodeBlock.svelte';
	import type { DocMeta } from '../../types.js';

	export const meta: DocMeta = {
		title: 'CodeBlock',
		component: CodeBlock,
		args: {
			code: `function greet(name: string) {\n  return \`Hello, \${name}!\`;\n}`
		}
	};

	export { Default, Multiline };
</script>

{#snippet Default(args: any)}
	<CodeBlock {...args} />
{/snippet}

{#snippet Multiline()}
	<CodeBlock code={`export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}`} />
{/snippet}
