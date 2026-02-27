import type { Snippet } from 'svelte';
/**
 * A compound table component with semantic HTML sub-components.
 *
 * @cssvar {color} --table-border - Border color (default: var(--color-border))
 * @cssvar {color} --table-bg - Background color (default: white)
 * @cssvar {color} --table-header-bg - Header background (default: var(--color-bg))
 * @cssvar {color} --table-hover-bg - Row hover background (default: var(--color-bg-hover))
 * @cssvar {color} --table-stripe-bg - Striped row background (default: var(--color-bg))
 */
interface Props {
    /** Table content (Head, Body, Foot, Caption) */
    children: Snippet;
    /** Show alternating row colors */
    striped?: boolean;
    /** Compact padding */
    compact?: boolean;
    /** Fixed table layout */
    fixed?: boolean;
    /** Remove outer border */
    borderless?: boolean;
    /** Additional CSS class */
    class?: string;
}
declare const Table: import("svelte").Component<Props, {}, "">;
type Table = ReturnType<typeof Table>;
export default Table;
