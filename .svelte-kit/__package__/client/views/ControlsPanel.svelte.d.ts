import type { ParsedProp, ParsedCssProp } from '../../types.js';
interface Props {
    componentProps: ParsedProp[];
    cssProps: ParsedCssProp[];
    propValues: Record<string, unknown>;
    cssValues: Record<string, string>;
    onPropChange: (name: string, value: unknown) => void;
    onCssChange: (name: string, value: string) => void;
    onReset: () => void;
}
declare const ControlsPanel: import("svelte").Component<Props, {}, "">;
type ControlsPanel = ReturnType<typeof ControlsPanel>;
export default ControlsPanel;
