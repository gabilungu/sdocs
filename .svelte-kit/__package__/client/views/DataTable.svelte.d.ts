interface Column {
    key: string;
    label: string;
}
interface Props {
    columns: Column[];
    rows: Record<string, unknown>[];
}
declare const DataTable: import("svelte").Component<Props, {}, "">;
type DataTable = ReturnType<typeof DataTable>;
export default DataTable;
