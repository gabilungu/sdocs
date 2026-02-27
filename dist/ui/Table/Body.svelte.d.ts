import type { Snippet } from 'svelte';
/**
 * Table body section. Contains data rows.
 */
interface Props {
    /** Data rows */
    children: Snippet;
}
declare const Body: import("svelte").Component<Props, {}, "">;
type Body = ReturnType<typeof Body>;
export default Body;
