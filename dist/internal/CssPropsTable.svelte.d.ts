import type { CssProps } from '../types.js';
interface Props {
    cssProps: CssProps;
    /** Current CSS values (for interactive mode) */
    values?: Record<string, string>;
    /** Callback when values change (enables interactive mode) */
    onchange?: (values: Record<string, string>) => void;
}
declare const CssPropsTable: import("svelte").Component<Props, {}, "">;
type CssPropsTable = ReturnType<typeof CssPropsTable>;
export default CssPropsTable;
