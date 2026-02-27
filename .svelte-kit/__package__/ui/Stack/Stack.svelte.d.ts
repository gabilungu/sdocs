import type { Snippet } from 'svelte';
/**
 * @cssvar {string} --direction - Flex direction (row | column)
 * @cssvar {length} --gap - Gap between items
 * @cssvar {string} --align - Align items
 * @cssvar {string} --justify - Justify content
 * @cssvar {string} --wrap - Flex wrap
 * @cssvar {shorthand} --p - Padding
 * @cssvar {color} --bg - Background color
 * @cssvar {length} --r - Border radius
 * @cssvar {shorthand} --b - Border
 */
interface Props {
    children: Snippet;
    class?: string;
}
declare const Stack: import("svelte").Component<Props, {}, "">;
type Stack = ReturnType<typeof Stack>;
export default Stack;
