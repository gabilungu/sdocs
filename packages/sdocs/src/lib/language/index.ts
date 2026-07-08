export {
	scanSdoc,
	offsetToPosition,
	ENTITY_KINDS,
	SUB_BLOCK_KINDS,
	type Span,
	type EntityKind,
	type SubBlockKind,
	type AttrValue,
	type Attrs,
	type SubBlock,
	type Entity,
	type TagBlock,
	type ScanError,
	type SdocFile,
} from './scanner.js';

export {
	projectSdoc,
	projectSdocBlocks,
	type SdocProjection,
	type SdocBlockProjection,
	type ProjectedLineKind,
} from './projection.js';

export {
	segmentPageBody,
	type PageSegment,
} from './page-islands.js';

export {
	configSchema,
	type ConfigSchema,
	type ConfigFieldSchema,
} from './config-schema.js';

export {
	parseSdoc,
	parseArgsLiteral,
	slugifyTitle,
	normalizeBody,
	attributeRules,
	type AttrRule,
	type ArgValue,
	type Sizing,
	type PreviewBlock,
	type ExampleBlock,
	type ShowcaseEntity,
	type DocEntity,
	type PageEntity,
	type LayoutEntity,
	type SdocEntity,
	type SdocDocument,
} from './parser.js';
