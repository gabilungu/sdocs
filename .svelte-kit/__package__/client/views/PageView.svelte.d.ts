import type { DocEntry } from '../../types.js';
interface Props {
    doc: DocEntry;
    activeStylesheet?: string;
}
declare const PageView: import("svelte").Component<Props, {}, "">;
type PageView = ReturnType<typeof PageView>;
export default PageView;
