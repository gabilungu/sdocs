import type { Snippet } from 'svelte';
/**
 * A table row. Use inside Head, Body, or Foot.
 */
interface Props {
    /** Row cells */
    children: Snippet;
    /** Additional CSS class */
    class?: string;
}
declare const Row: import("svelte").Component<Props, {}, "">;
type Row = ReturnType<typeof Row>;
export default Row;
