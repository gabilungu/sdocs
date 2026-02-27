import type { Snippet } from 'svelte';
interface Props {
    title: string;
    defaultExpanded?: boolean;
    children: Snippet;
}
declare const CollapsiblePanel: import("svelte").Component<Props, {}, "">;
type CollapsiblePanel = ReturnType<typeof CollapsiblePanel>;
export default CollapsiblePanel;
