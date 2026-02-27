import type { DocEntry } from '../../types.js';
interface Props {
    doc: DocEntry;
    activeStylesheet?: string;
}
declare const LayoutView: import("svelte").Component<Props, {}, "">;
type LayoutView = ReturnType<typeof LayoutView>;
export default LayoutView;
