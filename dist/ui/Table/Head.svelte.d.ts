import type { Snippet } from 'svelte';
/**
 * Table header section. Contains header rows.
 */
interface Props {
    /** Header rows */
    children: Snippet;
}
declare const Head: import("svelte").Component<Props, {}, "">;
type Head = ReturnType<typeof Head>;
export default Head;
