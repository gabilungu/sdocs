import type { Snippet } from 'svelte';
/**
 * Table footer section. Used for summary rows (totals, counts).
 */
interface Props {
    /** Footer rows */
    children: Snippet;
}
declare const Foot: import("svelte").Component<Props, {}, "">;
type Foot = ReturnType<typeof Foot>;
export default Foot;
