import type { ArgTypes } from '../types.js';
interface Props {
    argTypes: ArgTypes;
    args: Record<string, unknown>;
    /** Callback when args change (enables interactive controls) */
    onchange?: (args: Record<string, unknown>) => void;
}
declare const PropsTable: import("svelte").Component<Props, {
    bangProp: (name: string) => void;
}, "">;
type PropsTable = ReturnType<typeof PropsTable>;
export default PropsTable;
