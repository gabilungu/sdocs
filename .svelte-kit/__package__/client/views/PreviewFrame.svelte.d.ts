interface Props {
    src: string;
    props?: Record<string, unknown>;
    cssVars?: Record<string, string>;
    activeStylesheet?: string;
    fullHeight?: boolean;
}
declare const PreviewFrame: import("svelte").Component<Props, {}, "">;
type PreviewFrame = ReturnType<typeof PreviewFrame>;
export default PreviewFrame;
