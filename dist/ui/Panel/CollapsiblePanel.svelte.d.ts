import type { Snippet } from 'svelte';
interface Props {
    /** Title displayed in header */
    title?: string;
    /** Whether the panel is open */
    open?: boolean;
    /** Remove content padding */
    no_content_padding?: boolean;
    /** Panel content */
    children?: Snippet;
}
declare const CollapsiblePanel: import("svelte").Component<Props, {}, "open">;
type CollapsiblePanel = ReturnType<typeof CollapsiblePanel>;
export default CollapsiblePanel;
