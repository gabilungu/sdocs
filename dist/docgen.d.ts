import type { ArgType, CssProps, CssControlType, MethodType } from './types.js';
export interface ExtractedProp {
    name: string;
    type: string;
    required: boolean;
    defaultValue?: string;
    description?: string;
}
export interface ExtractedCssProp {
    name: string;
    type?: CssControlType;
    description?: string;
    default?: string;
}
export interface ExtractedMethod {
    name: string;
    params?: string;
    returnType?: string;
    description?: string;
}
export interface ComponentDocgen {
    props: ExtractedProp[];
    cssProps: ExtractedCssProp[];
    methods: ExtractedMethod[];
    description?: string;
}
/**
 * Parse Svelte 5 component props from source code.
 * Supports both interface Props {} and inline type annotations.
 */
export declare function parseProps(source: string): ComponentDocgen;
/**
 * Convert extracted component props to argTypes for controls
 */
export declare function propsToArgTypes(docgen: ComponentDocgen | undefined): Record<string, ArgType>;
/**
 * Extract default args from component docgen
 */
export declare function propsToDefaultArgs(docgen: ComponentDocgen | undefined): Record<string, unknown>;
/**
 * Convert extracted CSS props to CssProps config
 */
export declare function cssVarsToCssProps(docgen: ComponentDocgen | undefined): CssProps;
/**
 * Convert extracted methods to MethodType[] for the UI
 */
export declare function docgenToMethods(docgen: ComponentDocgen | undefined): MethodType[];
