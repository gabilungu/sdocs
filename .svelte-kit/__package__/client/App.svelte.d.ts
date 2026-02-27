import type { DocEntry } from '../types.js';
import '../ui/styles/theme.css';
interface Props {
    docs: DocEntry[];
    logo?: string;
    cssNames?: string[];
    sidebarConfig?: {
        order?: Record<string, string[]>;
        open?: string[];
    };
}
declare const App: import("svelte").Component<Props, {}, "">;
type App = ReturnType<typeof App>;
export default App;
