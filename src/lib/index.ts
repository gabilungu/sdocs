// Main component
export { default as Sdocs } from './Sdocs.svelte';

// Types
export type {
	ControlType,
	ArgType,
	ArgTypes,
	CssPropType,
	CssProps,
	DocMeta,
	Example,
	DocFile,
	SdocsProps
} from './types.js';

// Note: Vite plugin is exported separately from 'sdocs/vite'
// to avoid bundling Node.js code into client builds
