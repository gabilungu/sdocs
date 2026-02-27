import type { DocEntry } from '../../types.js';
interface Props {
    doc: DocEntry;
    /** If set, show only this example (full-page view) */
    snippetName?: string;
    activeStylesheet?: string;
}
declare const ComponentView: import("svelte").Component<Props, {}, "">;
type ComponentView = ReturnType<typeof ComponentView>;
export default ComponentView;
