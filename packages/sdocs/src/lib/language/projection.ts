/**
 * Line-preserving projection of a .sdoc file into a virtual Svelte document.
 *
 * Every authored line keeps its exact (line, column) in the virtual text, so
 * editor position mapping is the identity function. Block syntax the Svelte
 * compiler must not see becomes blank lines; sub-block openers are rewritten
 * IN PLACE to `{#snippet …(args)}` wrappers — byte-compatible with the shape
 * the build pipeline generates at runtime — and a trailer appended past the
 * authored end renders every snippet and references previewed components, so
 * nothing draws unused-import noise. Diagnostics on trailer lines
 * (line >= sourceLineCount) are generated, never authored.
 */

import type { SdocFile, Entity, SubBlock, Span } from './scanner.js';

export type ProjectedLineKind = 'verbatim' | 'blank' | 'wrapper' | 'masked';

export interface SdocProjection {
	/** The virtual Svelte document text */
	text: string;
	/** Authored line count; virtual lines at or past this are generated */
	sourceLineCount: number;
	/** Per authored line: how it was projected */
	lineKinds: ProjectedLineKind[];
}

function lineStartsOf(source: string): number[] {
	const starts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === '\n') starts.push(i + 1);
	}
	return starts;
}

function lineOfOffset(starts: number[], offset: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** Mask markdown code so a DOC body reads as Svelte-safe prose: fence lines
 * and fence interiors go blank; inline `code` spans are space-overwritten
 * (column-preserving). Everything else — prose, {expressions}, component
 * islands — stays verbatim. */
function maskMarkdownLine(line: string, state: { inFence: boolean }): { text: string; masked: boolean } {
	const fenceMarker = /^\s*(`{3,}|~{3,})/.test(line);
	if (fenceMarker) {
		state.inFence = !state.inFence;
		return { text: '', masked: true };
	}
	if (state.inFence) return { text: '', masked: true };
	if (!line.includes('`')) return { text: line, masked: false };
	const text = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
	return { text, masked: text !== line };
}

export function projectSdoc(file: SdocFile): SdocProjection {
	const source = file.source;
	const starts = lineStartsOf(source);
	const total = starts.length;
	const out: string[] = new Array(total).fill('');
	const kinds: ProjectedLineKind[] = new Array(total).fill('blank');

	const copyVerbatim = (span: Span) => {
		const first = lineOfOffset(starts, span.start);
		const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
		for (let l = first; l <= last; l++) {
			const end = l + 1 < total ? starts[l + 1] - 1 : source.length;
			out[l] = source.slice(starts[l], end).replace(/\r$/, '');
			kinds[l] = 'verbatim';
		}
	};

	if (file.script) copyVerbatim(file.script.span);
	if (file.style) copyVerbatim(file.style.span);

	const isTs = /lang\s*=\s*["']ts["']/.test(file.script?.attrsText ?? '');
	const argsParam = isTs ? '(args: any)' : '(args)';

	const snippets: { name: string; withArgs: boolean }[] = [];
	const componentRefs = new Set<string>();

	const wrapBlock = (
		name: string,
		openerSpan: Span,
		bodySpan: Span,
		closerLineOf: Span, // block span; its end sits on the closer line
		withArgs: boolean,
		maskBody: boolean,
	) => {
		const openFirst = lineOfOffset(starts, openerSpan.start);
		const openLast = lineOfOffset(starts, Math.max(openerSpan.start, openerSpan.end - 1));
		out[openFirst] = `{#snippet ${name}${withArgs ? argsParam : '()'}}`;
		kinds[openFirst] = 'wrapper';
		for (let l = openFirst + 1; l <= openLast; l++) {
			out[l] = '';
			kinds[l] = 'blank';
		}
		if (bodySpan.end > bodySpan.start) {
			if (maskBody) {
				const first = lineOfOffset(starts, bodySpan.start);
				const last = lineOfOffset(starts, Math.max(bodySpan.start, bodySpan.end - 1));
				const state = { inFence: false };
				for (let l = first; l <= last; l++) {
					const end = l + 1 < total ? starts[l + 1] - 1 : source.length;
					const line = source.slice(starts[l], end).replace(/\r$/, '');
					const masked = maskMarkdownLine(line, state);
					out[l] = masked.text;
					kinds[l] = masked.masked ? 'masked' : 'verbatim';
				}
			} else {
				copyVerbatim(bodySpan);
			}
		}
		const closeLine = lineOfOffset(starts, Math.max(closerLineOf.start, closerLineOf.end - 1));
		out[closeLine] = '{/snippet}';
		kinds[closeLine] = 'wrapper';
		snippets.push({ name, withArgs });
	};

	/** A DOC with [example] blocks: the prose regions and each example body
	 * become SIBLING snippets, split in place — the example opener line closes
	 * the running prose snippet and opens the example's, the example closer
	 * does the reverse. Siblings (not nested) so the trailer can render every
	 * one of them, keeping imports used only by examples free of unused noise. */
	const wrapDocWithExamples = (entity: Entity, e: number) => {
		const openFirst = lineOfOffset(starts, entity.openerSpan.start);
		const openLast = lineOfOffset(starts, Math.max(entity.openerSpan.start, entity.openerSpan.end - 1));
		out[openFirst] = `{#snippet __sdocs$${e}_p0()}`;
		kinds[openFirst] = 'wrapper';
		for (let l = openFirst + 1; l <= openLast; l++) {
			out[l] = '';
			kinds[l] = 'blank';
		}
		snippets.push({ name: `__sdocs$${e}_p0`, withArgs: false });

		const maskLines = (fromLine: number, toLine: number) => {
			const state = { inFence: false };
			for (let l = fromLine; l <= toLine; l++) {
				const end = l + 1 < total ? starts[l + 1] - 1 : source.length;
				const line = source.slice(starts[l], end).replace(/\r$/, '');
				const masked = maskMarkdownLine(line, state);
				out[l] = masked.text;
				kinds[l] = masked.masked ? 'masked' : 'verbatim';
			}
		};

		let proseFrom = openLast + 1;
		entity.blocks.forEach((block: SubBlock, b: number) => {
			const bOpenFirst = lineOfOffset(starts, block.openerSpan.start);
			const bOpenLast = lineOfOffset(starts, Math.max(block.openerSpan.start, block.openerSpan.end - 1));
			maskLines(proseFrom, bOpenFirst - 1);
			out[bOpenFirst] = `{/snippet}{#snippet __sdocs$${e}_${b}${argsParam}}`;
			kinds[bOpenFirst] = 'wrapper';
			for (let l = bOpenFirst + 1; l <= bOpenLast; l++) {
				out[l] = '';
				kinds[l] = 'blank';
			}
			if (block.bodySpan.end > block.bodySpan.start) copyVerbatim(block.bodySpan);
			const bClose = lineOfOffset(starts, Math.max(block.span.start, block.span.end - 1));
			out[bClose] = `{/snippet}{#snippet __sdocs$${e}_p${b + 1}()}`;
			kinds[bClose] = 'wrapper';
			snippets.push({ name: `__sdocs$${e}_${b}`, withArgs: true });
			snippets.push({ name: `__sdocs$${e}_p${b + 1}`, withArgs: false });
			proseFrom = bClose + 1;
		});

		const closeLine = lineOfOffset(starts, Math.max(entity.span.start, entity.span.end - 1));
		maskLines(proseFrom, closeLine - 1);
		out[closeLine] = '{/snippet}';
		kinds[closeLine] = 'wrapper';
	};

	file.entities.forEach((entity: Entity, e: number) => {
		if (entity.kind === 'SHOWCASE') {
			entity.blocks.forEach((block: SubBlock, b: number) => {
				wrapBlock(`__sdocs$${e}_${b}`, block.openerSpan, block.bodySpan, block.span, true, false);
				const component = block.attrs.component;
				if (component?.kind === 'expression') {
					const name = component.raw.trim();
					if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) componentRefs.add(name);
				}
			});
		} else if (entity.kind === 'DOC' && entity.blocks.length > 0) {
			wrapDocWithExamples(entity, e);
		} else {
			wrapBlock(
				`__sdocs$${e}`,
				entity.openerSpan,
				entity.bodySpan,
				entity.span,
				false,
				entity.kind === 'DOC',
			);
		}
	});

	// Trailer: render every snippet and reference previewed components so the
	// Svelte/TS layer sees everything as used. Lives past the authored end.
	const trailer = ['{#if false}'];
	for (const snippet of snippets) {
		trailer.push(`{@render ${snippet.name}(${snippet.withArgs ? '{}' : ''})}`);
	}
	for (const name of componentRefs) {
		trailer.push(`<${name} />`);
	}
	trailer.push('{/if}');

	return {
		text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
		sourceLineCount: total,
		lineKinds: kinds,
	};
}

/** A per-block projection for a block that declares its own <script> or
 * <style>. Line-preserving like the base projection. */
export interface SdocBlockProjection extends SdocProjection {
	/** Stable id: entity index + block index (for virtual URIs) */
	key: string;
	/** Authored line range this projection owns (block opener → closer,
	 * inclusive): the base projection's diagnostics are suppressed here and
	 * this projection's shown, so each line has exactly one owner. */
	firstLine: number;
	lastLine: number;
}

/**
 * Project each script/style-bearing [preview]/[example] block into its own
 * line-preserving virtual Svelte document, where the block's script is a real
 * component script and its style a real component style:
 *
 * - The file <script> opens at its authored line and DOES NOT CLOSE — its
 *   closer line, everything between it and the block's script, and the block
 *   script's opener line go blank (blank lines are valid inside a script) —
 *   until the block script's closer line, which becomes
 *   `</script>{#snippet …(args)}`. File declarations and block declarations
 *   share one scope: lexical nesting by concatenation, byte-compatible with
 *   what the build pipeline generates.
 * - The block markup stays verbatim inside the snippet.
 * - A block <style> becomes the component's own style: its opener line is
 *   rewritten to `{/snippet}<style>`, its content stays verbatim (real CSS
 *   intelligence), and the block closer goes blank.
 * - Everything else in the file goes blank; a trailer renders the snippet.
 */
export function projectSdocBlocks(file: SdocFile): SdocBlockProjection[] {
	const source = file.source;
	const starts = lineStartsOf(source);
	const total = starts.length;
	const TS_RE = /lang\s*=\s*["']ts["']/;
	const fileIsTs = TS_RE.test(file.script?.attrsText ?? '');
	const projections: SdocBlockProjection[] = [];

	file.entities.forEach((entity, e) => {
		entity.blocks.forEach((block, b) => {
			if (!block.script && !block.style) return;

			// The merged script is TypeScript when either part is — a TS block
			// script inside a plain-JS file must not lose its lang.
			const blockIsTs = TS_RE.test(block.script?.attrsText ?? '');
			const isTs = fileIsTs || blockIsTs;
			const argsParam = isTs ? '(args: any)' : '(args)';

			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
			const copyVerbatim = (span: Span) => {
				const first = lineOfOffset(starts, span.start);
				const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
				for (let l = first; l <= last; l++) {
					const end = l + 1 < total ? starts[l + 1] - 1 : source.length;
					out[l] = source.slice(starts[l], end).replace(/\r$/, '');
					kinds[l] = 'verbatim';
				}
			};

			const name = `__sdocs$${e}_${b}`;
			const openerLine = lineOfOffset(starts, block.openerSpan.start);
			const closerLine = lineOfOffset(starts, Math.max(block.span.start, block.span.end - 1));

			if (block.script) {
				const scriptOpenLine = lineOfOffset(starts, block.script.span.start);
				const scriptCloseLine = lineOfOffset(starts, Math.max(block.script.span.start, block.script.span.end - 1));
				// Copy the script content first: its span starts just after the
				// opener's '>' (same line), so whole-line copying resurrects the
				// opener — the boundary lines are overwritten after.
				if (block.script.contentSpan.end > block.script.contentSpan.start) {
					copyVerbatim(block.script.contentSpan);
				}
				if (file.script) {
					// Extend the file script through the block script. If the file
					// script sits on ONE line, blanking its closer line would erase
					// the opener and imports — recompose the line without its
					// `</script>` instead.
					copyVerbatim(file.script.span);
					const fileOpenLine = lineOfOffset(starts, file.script.span.start);
					const fileCloseLine = lineOfOffset(
						starts,
						Math.max(file.script.span.start, file.script.span.end - 1),
					);
					// A TS block script inside a plain-JS file script: the merged
					// script tag must carry lang="ts" or the TS content mis-parses.
					const langFix = blockIsTs && !fileIsTs ? ' lang="ts"' : '';
					if (langFix && fileOpenLine !== fileCloseLine) {
						const lineEnd = fileOpenLine + 1 < total ? starts[fileOpenLine + 1] - 1 : source.length;
						const openTail = source.slice(
							Math.min(file.script.contentSpan.start, lineEnd),
							Math.min(file.script.contentSpan.end, lineEnd),
						);
						out[fileOpenLine] = `<script${file.script.attrsText}${langFix}>${openTail}`;
						kinds[fileOpenLine] = 'wrapper';
					}
					const fileTail = source.slice(
						Math.max(starts[fileCloseLine], file.script.contentSpan.start),
						file.script.contentSpan.end,
					);
					out[fileCloseLine] =
						(fileOpenLine === fileCloseLine
							? `<script${file.script.attrsText}${langFix}>`
							: '') + fileTail;
					kinds[fileCloseLine] = 'wrapper';
					if (scriptOpenLine !== scriptCloseLine) {
						out[scriptOpenLine] = '';
						kinds[scriptOpenLine] = 'wrapper';
					}
				} else if (scriptOpenLine !== scriptCloseLine) {
					// The block script opens the (only) script itself.
					const end = scriptOpenLine + 1 < total ? starts[scriptOpenLine + 1] - 1 : source.length;
					out[scriptOpenLine] = source.slice(starts[scriptOpenLine], end).replace(/\r$/, '');
					kinds[scriptOpenLine] = 'verbatim';
				}
				// Content sharing the closer line — a one-liner script or a trailing
				// `let b = 2;</script>` — must survive the wrapper rewrite.
				const scriptTail = source.slice(
					Math.max(starts[scriptCloseLine], block.script.contentSpan.start),
					block.script.contentSpan.end,
				);
				const opensHere =
					!file.script && scriptOpenLine === scriptCloseLine
						? `<script${block.script.attrsText}>`
						: '';
				out[scriptCloseLine] = `${opensHere}${scriptTail}</script>{#snippet ${name}${argsParam}}`;
				kinds[scriptCloseLine] = 'wrapper';
			} else {
				// Style-only block: the file script stays as authored; the block
				// opener opens the snippet, exactly like the base projection.
				if (file.script) copyVerbatim(file.script.span);
				out[openerLine] = `{#snippet ${name}${argsParam}}`;
				kinds[openerLine] = 'wrapper';
			}

			if (block.markupSpan.end > block.markupSpan.start) copyVerbatim(block.markupSpan);

			if (block.style) {
				const styleOpenLine = lineOfOffset(starts, block.style.span.start);
				const styleCloseLine = lineOfOffset(starts, Math.max(block.style.span.start, block.style.span.end - 1));
				// Content first, boundary lines after (same reason as the script).
				if (block.style.contentSpan.end > block.style.contentSpan.start) {
					copyVerbatim(block.style.contentSpan);
				}
				// Content sharing the closer line (a one-liner style) must survive.
				const styleTail = source.slice(
					Math.max(starts[styleCloseLine], block.style.contentSpan.start),
					block.style.contentSpan.end,
				);
				if (styleOpenLine !== styleCloseLine) {
					out[styleOpenLine] = `{/snippet}<style>`;
					kinds[styleOpenLine] = 'wrapper';
					out[styleCloseLine] = `${styleTail}</style>`;
				} else {
					out[styleCloseLine] = `{/snippet}<style>${styleTail}</style>`;
				}
				kinds[styleCloseLine] = 'wrapper';
				// The block closer line stays blank.
			} else {
				out[closerLine] = '{/snippet}';
				kinds[closerLine] = 'wrapper';
			}

			const trailer = ['{#if false}', `{@render ${name}({})}`, '{/if}'];
			projections.push({
				key: `${e}_${b}`,
				firstLine: openerLine,
				lastLine: closerLine,
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
			});
		});
	});

	return projections;
}
