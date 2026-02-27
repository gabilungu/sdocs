import type { Snippet } from 'svelte';
/**
 * An accessible table caption. Announced by screen readers when navigating to the table.
 */
interface Props {
    /** Caption content */
    children: Snippet;
}
declare const Caption: import("svelte").Component<Props, {}, "">;
type Caption = ReturnType<typeof Caption>;
export default Caption;
