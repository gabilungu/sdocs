import type { Snippet } from 'svelte';
/**
 * A table data cell. Use inside Row.
 */
interface Props {
    /** Cell content */
    children: Snippet;
    /** Number of columns to span */
    colspan?: number;
    /** Text alignment */
    align?: 'left' | 'center' | 'right';
}
declare const Cell: import("svelte").Component<Props, {}, "">;
type Cell = ReturnType<typeof Cell>;
export default Cell;
