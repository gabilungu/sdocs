/**
 * A Placeholder rectangle for visualizing layouts and empty spaces.
 * Call `run()` to trigger a flash animation (useful for testing function props).
 */
interface Props {
    /** Text to display inside the Placeholder */
    text?: string;
    /** Border radius in pixels */
    radius?: number;
    /** Color variant */
    color?: 'pink' | 'green' | 'blue';
    /** Width (any CSS dimension) */
    width?: string;
    /** Height (any CSS dimension) */
    height?: string;
}
declare const Placeholder: import("svelte").Component<Props, {
    bang: () => void;
}, "">;
type Placeholder = ReturnType<typeof Placeholder>;
export default Placeholder;
