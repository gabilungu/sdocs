import type { ResolvedSdocsConfig, StageLayout } from '../types.js';

/** The sizing attributes a block or entity can carry. */
export interface SizingAttrs {
	maxWidth: string | null;
	padding: string | null;
	direction: string | null;
	gap: string | null;
	contentX: string | null;
	contentY: string | null;
	background: string | null;
	minHeight: string | null;
}

interface EntityLike {
	kind: string;
	sizing: Partial<SizingAttrs> & { maxWidth?: string | null };
}

function kindKeyOf(kind: string): 'showcase' | 'doc' | 'page' | 'layout' {
	if (kind === 'SHOWCASE') return 'showcase';
	if (kind === 'DOC') return 'doc';
	if (kind === 'PAGE') return 'page';
	return 'layout';
}

/**
 * Resolve one stage's layout through the cascade: block attribute → entity
 * attribute → config default.
 *
 * Shared rather than inlined because the numbers are quoted in two places that
 * must agree — the style the stage actually renders with, and what the MCP
 * server reports to a client deciding how to photograph it. A padding the tool
 * reports but the stage doesn't apply is worse than no answer.
 */
export function resolveStageLayout(
	entity: EntityLike,
	block: SizingAttrs | undefined,
	config: ResolvedSdocsConfig,
): StageLayout {
	const kindDefaults = config.content[kindKeyOf(entity.kind)];
	return {
		// Entity-level maxWidth on SHOWCASE/PAGE is the content column, not the
		// stage; stages inside them span their panel unless the block says so.
		maxWidth:
			block?.maxWidth ??
			(entity.kind === 'LAYOUT' ? (entity.sizing.maxWidth ?? kindDefaults.maxWidth) : '100%'),
		padding: block?.padding ?? entity.sizing.padding ?? kindDefaults.padding,
		// direction/gap/contentX flex the preview/example stages only
		...(entity.kind === 'SHOWCASE' && block
			? {
					direction: block.direction ?? entity.sizing.direction ?? config.content.showcase.direction,
					gap: block.gap ?? entity.sizing.gap ?? config.content.showcase.gap,
					contentX: block.contentX ?? entity.sizing.contentX ?? config.content.showcase.contentX,
					contentY: block.contentY ?? entity.sizing.contentY ?? config.content.showcase.contentY,
					background:
						block.background ??
						entity.sizing.background ??
						config.content.showcase.background ??
						undefined,
					minHeight:
						block.minHeight ??
						entity.sizing.minHeight ??
						config.content.showcase.minHeight ??
						undefined,
				}
			: {}),
		// A LAYOUT is the page canvas: it can paint and size its stage
		// (background/minHeight) while staying flow-root.
		...(entity.kind === 'LAYOUT'
			? {
					background: entity.sizing.background ?? config.content.layout.background ?? undefined,
					minHeight: entity.sizing.minHeight ?? config.content.layout.minHeight ?? undefined,
				}
			: {}),
	};
}
