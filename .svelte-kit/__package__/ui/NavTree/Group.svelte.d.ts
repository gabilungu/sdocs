import type { Snippet } from 'svelte';
interface Props {
    label: string;
    expanded?: boolean;
    children?: Snippet;
    class?: string;
    onclick?: () => void;
}
declare const Group: import("svelte").Component<Props, {}, "expanded">;
type Group = ReturnType<typeof Group>;
export default Group;
