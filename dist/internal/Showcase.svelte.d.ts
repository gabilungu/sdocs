import type { Snippet } from 'svelte';
import type { ArgType, CssProps, MethodType } from '../types.js';
interface Props {
    /** The render function for the component preview */
    render: Snippet<[Record<string, unknown>]>;
    /** Current args values */
    args: Record<string, unknown>;
    /** Arg type definitions for controls and props table */
    argTypes?: Record<string, ArgType>;
    /** CSS custom properties that can be set on the component */
    cssProps?: CssProps;
    /** Exported component methods */
    methods?: MethodType[];
    /** Callback when args change */
    onchange?: (args: Record<string, unknown>) => void;
    /** Optional source code to display */
    source?: string;
}
declare const Showcase: import("svelte").Component<Props, {}, "">;
type Showcase = ReturnType<typeof Showcase>;
export default Showcase;
