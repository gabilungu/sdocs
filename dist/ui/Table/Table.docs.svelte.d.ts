import { Table } from './index.js';
import type { DocMeta } from '../../types.js';
declare const Default: (args: any) => ReturnType<import("svelte").Snippet>;
declare const Striped: () => ReturnType<import("svelte").Snippet>;
declare const Compact: () => ReturnType<import("svelte").Snippet>;
declare const WithCaption: () => ReturnType<import("svelte").Snippet>;
declare const WithFooter: () => ReturnType<import("svelte").Snippet>;
declare const SectionHeaders: () => ReturnType<import("svelte").Snippet>;
export declare const meta: DocMeta;
export { Default, Striped, Compact, WithCaption, WithFooter, SectionHeaders };
interface $$__sveltets_2_IsomorphicComponent<Props extends Record<string, any> = any, Events extends Record<string, any> = any, Slots extends Record<string, any> = any, Exports = {}, Bindings = string> {
    new (options: import('svelte').ComponentConstructorOptions<Props>): import('svelte').SvelteComponent<Props, Events, Slots> & {
        $$bindings?: Bindings;
    } & Exports;
    (internal: unknown, props: {
        $$events?: Events;
        $$slots?: Slots;
    }): Exports & {
        $set?: any;
        $on?: any;
    };
    z_$$bindings?: Bindings;
}
declare const Table: $$__sveltets_2_IsomorphicComponent<Record<string, never>, {
    [evt: string]: CustomEvent<any>;
}, {}, {}, string>;
type Table = InstanceType<typeof Table>;
export default Table;
