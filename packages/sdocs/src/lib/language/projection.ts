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

export type ProjectedLineKind = 'verbatim' | 'blank' | 'wrapper' | 'masked' | 'recomposed';

/** The column range of authored content a 'recomposed' line preserves at its
 * exact authored columns — positions inside it map 1:1 between the authored
 * and virtual documents; everything outside it is generated tag text. */
export interface RecomposedSpan {
	start: number;
	end: number;
}

export interface SdocProjection {
	/** The virtual Svelte document text */
	text: string;
	/** Authored line count; virtual lines at or past this are generated */
	sourceLineCount: number;
	/** Per authored line: how it was projected */
	lineKinds: ProjectedLineKind[];
	/** Per authored line, set exactly where lineKinds is 'recomposed': the
	 * authored-content span of that line. Sparse; absent for projections that
	 * never recompose (the base projection). */
	contentSpans?: (RecomposedSpan | undefined)[];
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
function maskMarkdownLine(
	line: string,
	state: { inFence: boolean; fenceMarker?: string; fenceLen?: number },
): { text: string; masked: boolean } {
	const fence = line.match(/^\s*(`{3,}|~{3,})/);
	if (fence) {
		const marker = fence[1][0];
		const len = fence[1].length;
		if (!state.inFence) {
			state.inFence = true;
			state.fenceMarker = marker;
			state.fenceLen = len;
		} else if (marker === state.fenceMarker && len >= (state.fenceLen ?? 3)) {
			// CommonMark: a fence closes only on the SAME marker character with
			// AT LEAST as many chars; other marker lines are fenced content.
			state.inFence = false;
		}
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

		// Entity-level <script>/<style> lines stay blank here: the per-entity
		// virtual doc (projectSdocBlocks) owns and checks them.
		let proseFrom = openLast + 1;
		if (entity.script) {
			const scriptClose = lineOfOffset(
				starts,
				Math.max(entity.script.span.start, entity.script.span.end - 1),
			);
			proseFrom = Math.max(proseFrom, scriptClose + 1);
		}
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
		let proseTo = closeLine - 1;
		if (entity.style) {
			proseTo = Math.min(proseTo, lineOfOffset(starts, entity.style.span.start) - 1);
		}
		maskLines(proseFrom, proseTo);
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

/** A per-block (or per-entity) projection for content that declares its own
 * <script> or <style>. Line-preserving like the base projection. */
export interface SdocBlockProjection extends SdocProjection {
	/** Stable id for virtual URIs: entity index, or entity_block */
	key: string;
	/** Authored line range this projection owns (opener → closer, inclusive) */
	firstLine: number;
	lastLine: number;
	/** Extra owned lines outside the range — e.g. the entity script lines a
	 * SHOWCASE per-entity style doc also speaks for. Each line has exactly
	 * one owner overall. */
	extraOwnedLines?: number[];
}

interface ChainScript {
	tag: TagBlockLike;
}
interface TagBlockLike {
	attrsText: string;
	content: string;
	contentSpan: Span;
	span: Span;
}

/**
 * Project each script/style-bearing block — and each entity with its own
 * script/style — into a line-preserving virtual Svelte document. Scripts
 * CHAIN lexically: file → entity → block concatenate into one component
 * script, byte-compatible with the runtime build. Per-entity docs carry every
 * block's markup, so entity-scope declarations read as used wherever they are
 * used. Single-line tags and content sharing an opener/closer line are
 * recomposed, never dropped — kept at their authored columns with the content
 * span recorded ('recomposed') whenever the emitted tag text fits before them.
 */
export function projectSdocBlocks(file: SdocFile): SdocBlockProjection[] {
	const source = file.source;
	const starts = lineStartsOf(source);
	const total = starts.length;
	const TS_RE = /lang\s*=\s*["']ts["']/;
	const projections: SdocBlockProjection[] = [];

	const lineTextOf = (l: number) => {
		const end = l + 1 < total ? starts[l + 1] - 1 : source.length;
		return source.slice(starts[l], end).replace(/\r$/, '');
	};

	/** Recompose a line as emitted tag text followed by authored content. When
	 * the emitted prefix fits before the content's authored column, the gap is
	 * space-padded so the content keeps its EXACT authored columns and the line
	 * becomes 'recomposed' with its content span recorded — positions inside
	 * the span map 1:1, so diagnostics/hover/completion stay live there. When
	 * the emitted prefix outgrows the authored one (e.g. a '{/snippet}' graft),
	 * identity mapping is impossible: the pieces are emitted adjacent and the
	 * line stays a gated 'wrapper' (no span — no wrong coordinates). A
	 * whitespace-only content share (a closer line's indent) also stays a
	 * wrapper: there is nothing there to speak about. */
	const recompose = (
		out: string[],
		kinds: ProjectedLineKind[],
		spans: (RecomposedSpan | undefined)[],
		line: number,
		emitted: string,
		content: string,
		contentCol: number,
	): void => {
		if (content.trim() && emitted.length <= contentCol) {
			out[line] = emitted + ' '.repeat(contentCol - emitted.length) + content;
			kinds[line] = 'recomposed';
			spans[line] = { start: contentCol, end: contentCol + content.length };
		} else {
			out[line] = emitted + content;
			kinds[line] = 'wrapper';
		}
	};

	/** Emit a <style> tag into a virtual doc: interior lines verbatim, the
	 * opener recomposed as `prefix<style>` with content sharing the opener
	 * line preserved after it, and content sharing the closer line kept
	 * before the `</style>` — never dropped, and kept at authored columns
	 * (span recorded) whenever the emitted prefix fits. */
	const emitStyle = (
		out: string[],
		kinds: ProjectedLineKind[],
		spans: (RecomposedSpan | undefined)[],
		style: TagBlockLike,
		prefix: string,
	): { open: number; close: number } => {
		const open = lineOfOffset(starts, style.span.start);
		const close = lineOfOffset(starts, Math.max(style.span.start, style.span.end - 1));
		if (style.contentSpan.end > style.contentSpan.start) {
			const first = lineOfOffset(starts, style.contentSpan.start);
			const last = lineOfOffset(starts, Math.max(style.contentSpan.start, style.contentSpan.end - 1));
			for (let l = first; l <= last; l++) {
				out[l] = lineTextOf(l);
				kinds[l] = 'verbatim';
			}
		}
		const tail = source.slice(Math.max(starts[close], style.contentSpan.start), style.contentSpan.end);
		// Without a snippet closer to graft on, keep the authored indent so the
		// recomposed opener sits at its authored columns.
		const lead = prefix || source.slice(starts[open], style.span.start);
		if (open !== close) {
			const lineEnd = open + 1 < total ? starts[open + 1] - 1 : source.length;
			const head = source.slice(
				Math.min(style.contentSpan.start, lineEnd),
				Math.min(style.contentSpan.end, lineEnd),
			);
			recompose(out, kinds, spans, open, `${lead}<style>`, head, style.contentSpan.start - starts[open]);
			recompose(out, kinds, spans, close, '', tail, 0);
		} else {
			recompose(
				out,
				kinds,
				spans,
				close,
				`${lead}<style>`,
				tail,
				style.contentSpan.start - starts[close],
			);
		}
		out[close] += '</style>';
		return { open, close };
	};

	file.entities.forEach((entity, e) => {
		const entityScript = entity.script;

		/** Copy the chained scripts into out[], returning the line that must
		 * carry the `</script>` (the last script's closer) and the lines the
		 * entity script occupies (for ownership). */
		const buildChain = (
			out: string[],
			kinds: ProjectedLineKind[],
			spans: (RecomposedSpan | undefined)[],
			scripts: TagBlockLike[],
		): { closeLine: number; opensHere: string } => {
			const copyVerbatim = (span: Span) => {
				const first = lineOfOffset(starts, span.start);
				const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
				for (let l = first; l <= last; l++) {
					out[l] = lineTextOf(l);
					kinds[l] = 'verbatim';
				}
			};
			const isTs = scripts.some((sc) => TS_RE.test(sc.attrsText));
			let closeLine = -1;
			let opensHere = '';
			scripts.forEach((sc, i) => {
				const openLine = lineOfOffset(starts, sc.span.start);
				const closerLine = lineOfOffset(starts, Math.max(sc.span.start, sc.span.end - 1));
				if (sc.contentSpan.end > sc.contentSpan.start) copyVerbatim(sc.contentSpan);
				// Content sharing the closer line survives the rewrite, at its
				// authored columns (a multi-line tail starts at the line start).
				const tail = source.slice(
					Math.max(starts[closerLine], sc.contentSpan.start),
					sc.contentSpan.end,
				);
				const columnOf = (line: number) => sc.contentSpan.start - starts[line];
				if (i === 0) {
					// The outermost script provides the real opener.
					const langFix = isTs && !TS_RE.test(sc.attrsText) ? ' lang="ts"' : '';
					const opener = `<script${sc.attrsText}${langFix}>`;
					if (openLine === closerLine) {
						// Single-line: recompose opener + content, drop the closer.
						recompose(out, kinds, spans, closerLine, opener, tail, columnOf(closerLine));
						opensHere = '';
					} else {
						if (langFix) {
							const lineEnd = openLine + 1 < total ? starts[openLine + 1] - 1 : source.length;
							const openTail = source.slice(
								Math.min(sc.contentSpan.start, lineEnd),
								Math.min(sc.contentSpan.end, lineEnd),
							);
							recompose(out, kinds, spans, openLine, opener, openTail, columnOf(openLine));
						} else {
							out[openLine] = lineTextOf(openLine);
							kinds[openLine] = 'verbatim';
						}
						recompose(out, kinds, spans, closerLine, '', tail, 0);
					}
				} else {
					// Inner scripts: the opener tag goes blank (we are inside the
					// merged region), but content sharing the opener or closer line
					// is recomposed at its authored column, never dropped.
					if (openLine !== closerLine) {
						const lineEnd = openLine + 1 < total ? starts[openLine + 1] - 1 : source.length;
						const head = source.slice(
							Math.min(sc.contentSpan.start, lineEnd),
							Math.min(sc.contentSpan.end, lineEnd),
						);
						recompose(out, kinds, spans, openLine, '', head, columnOf(openLine));
						recompose(out, kinds, spans, closerLine, '', tail, 0);
					} else {
						recompose(out, kinds, spans, closerLine, '', tail, columnOf(closerLine));
					}
				}
				closeLine = closerLine;
			});
			if (scripts.length === 0) opensHere = '<script>';
			return { closeLine, opensHere };
		};

		const argsParamOf = (blockScript: TagBlockLike | null) => {
			const isTs =
				TS_RE.test(file.script?.attrsText ?? '') ||
				TS_RE.test(entityScript?.attrsText ?? '') ||
				TS_RE.test(blockScript?.attrsText ?? '');
			return isTs ? '(args: any)' : '(args)';
		};

		const entityScriptLines = (): number[] => {
			if (!entityScript) return [];
			const first = lineOfOffset(starts, entityScript.span.start);
			const last = lineOfOffset(starts, Math.max(entityScript.span.start, entityScript.span.end - 1));
			const lines: number[] = [];
			for (let l = first; l <= last; l++) lines.push(l);
			return lines;
		};

		// PAGE/LAYOUT with an entity script/style: the body IS the content.
		if ((entity.kind === 'PAGE' || entity.kind === 'LAYOUT') && (entity.script || entity.style)) {
			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
			const spans: (RecomposedSpan | undefined)[] = new Array(total);
			const copyVerbatim = (span: Span) => {
				const first = lineOfOffset(starts, span.start);
				const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
				for (let l = first; l <= last; l++) {
					out[l] = lineTextOf(l);
					kinds[l] = 'verbatim';
				}
			};
			const scripts = [file.script, entity.script].filter((x): x is TagBlockLike => !!x);
			if (scripts.length > 0) {
				const { closeLine } = buildChain(out, kinds, spans, scripts);
				out[closeLine] = `${out[closeLine]}</script>`;
			}
			if (entity.bodySpan.end > entity.bodySpan.start) copyVerbatim(entity.bodySpan);
			if (entity.style) emitStyle(out, kinds, spans, entity.style, '');
			const firstLine = lineOfOffset(starts, entity.openerSpan.start);
			const lastLine = lineOfOffset(starts, Math.max(entity.span.start, entity.span.end - 1));
			projections.push({
				key: `${e}`,
				firstLine,
				lastLine,
				text: out.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
				contentSpans: spans,
			});
			return;
		}

		// DOC with an entity script/style: a per-entity doc carries the chained
		// file→entity script, the masked prose (islands and {expressions} live),
		// every [example]'s markup as sibling snippets — so entity-script
		// imports used only inside examples read as used — and the entity style.
		// Example diagnostics stay with the per-block docs, which own the
		// example lines; block script/style lines stay blank here.
		if (entity.kind === 'DOC' && (entityScript || entity.style)) {
			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
			const spans: (RecomposedSpan | undefined)[] = new Array(total);
			const copyVerbatim = (span: Span) => {
				const first = lineOfOffset(starts, span.start);
				const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
				for (let l = first; l <= last; l++) {
					out[l] = lineTextOf(l);
					kinds[l] = 'verbatim';
				}
			};
			const maskLines = (fromLine: number, toLine: number) => {
				const state = { inFence: false };
				for (let l = fromLine; l <= toLine; l++) {
					const masked = maskMarkdownLine(lineTextOf(l), state);
					out[l] = masked.text;
					kinds[l] = masked.masked ? 'masked' : 'verbatim';
				}
			};

			const name = `__sdocs$${e}`;
			const openFirst = lineOfOffset(starts, entity.openerSpan.start);
			const openLast = lineOfOffset(starts, Math.max(entity.openerSpan.start, entity.openerSpan.end - 1));
			const closerLine = lineOfOffset(starts, Math.max(entity.span.start, entity.span.end - 1));

			const scripts = [file.script, entityScript].filter((x): x is TagBlockLike => !!x);
			let proseFrom = openLast + 1;
			if (scripts.length > 0) {
				const { closeLine } = buildChain(out, kinds, spans, scripts);
				if (entityScript) {
					// The entity script's closer opens the prose snippet.
					out[closeLine] = `${out[closeLine]}</script>{#snippet ${name}()}`;
					proseFrom = Math.max(proseFrom, closeLine + 1);
				} else {
					out[closeLine] = `${out[closeLine]}</script>`;
					out[openFirst] = `{#snippet ${name}()}`;
					kinds[openFirst] = 'wrapper';
				}
			} else {
				out[openFirst] = `{#snippet ${name}()}`;
				kinds[openFirst] = 'wrapper';
			}

			const argsParam = argsParamOf(null);
			const renders = [`{@render ${name}()}`];
			entity.blocks.forEach((block, b) => {
				const bOpen = lineOfOffset(starts, block.openerSpan.start);
				const bClose = lineOfOffset(starts, Math.max(block.span.start, block.span.end - 1));
				maskLines(proseFrom, bOpen - 1);
				// The example opener closes the running prose snippet and opens the
				// example's; the closer does the reverse (the sibling-snippet shape
				// of the base projection).
				out[bOpen] = `{/snippet}{#snippet ${name}_${b}${argsParam}}`;
				kinds[bOpen] = 'wrapper';
				if (block.markupSpan.end > block.markupSpan.start) copyVerbatim(block.markupSpan);
				out[bClose] = `{/snippet}{#snippet ${name}_p${b + 1}()}`;
				kinds[bClose] = 'wrapper';
				renders.push(`{@render ${name}_${b}({})}`, `{@render ${name}_p${b + 1}()}`);
				proseFrom = bClose + 1;
			});

			if (entity.style) {
				const styleOpen = lineOfOffset(starts, entity.style.span.start);
				maskLines(proseFrom, styleOpen - 1);
				emitStyle(out, kinds, spans, entity.style, '{/snippet}');
			} else {
				maskLines(proseFrom, closerLine - 1);
				out[closerLine] = '{/snippet}';
				kinds[closerLine] = 'wrapper';
			}

			const trailer = ['{#if false}', ...renders, '{/if}'];
			projections.push({
				key: `${e}`,
				firstLine: openFirst,
				lastLine: closerLine,
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
				contentSpans: spans,
			});
		}

		// SHOWCASE with an entity script/style: a per-entity doc carries the
		// chained file→entity script and every block's markup wrapped in
		// snippets — so entity-script declarations used by ANY block read as
		// used, and the entity style is checked against every block's markup,
		// matching the runtime merge of entity style into each preview/example
		// component. Block-owned lines keep their diagnostics in the per-block
		// docs, which are pushed after and own those line ranges.
		if (entity.kind === 'SHOWCASE' && (entityScript || entity.style)) {
			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
			const spans: (RecomposedSpan | undefined)[] = new Array(total);
			const copyVerbatim = (span: Span) => {
				const first = lineOfOffset(starts, span.start);
				const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
				for (let l = first; l <= last; l++) {
					out[l] = lineTextOf(l);
					kinds[l] = 'verbatim';
				}
			};

			const scripts = [file.script, entityScript].filter((x): x is TagBlockLike => !!x);
			if (scripts.length > 0) {
				const { closeLine } = buildChain(out, kinds, spans, scripts);
				out[closeLine] = `${out[closeLine]}</script>`;
			}

			const argsParam = argsParamOf(null);
			const names: string[] = [];
			entity.blocks.forEach((block, b) => {
				const bOpen = lineOfOffset(starts, block.openerSpan.start);
				const bClose = lineOfOffset(starts, Math.max(block.span.start, block.span.end - 1));
				const snippetName = `__sdocs$${e}_${b}`;
				out[bOpen] = `{#snippet ${snippetName}${argsParam}}`;
				kinds[bOpen] = 'wrapper';
				if (block.markupSpan.end > block.markupSpan.start) copyVerbatim(block.markupSpan);
				out[bClose] = '{/snippet}';
				kinds[bClose] = 'wrapper';
				names.push(snippetName);
			});

			let firstLine: number;
			let lastLine: number;
			let extraOwnedLines: number[] = [];
			if (entity.style) {
				const { open, close } = emitStyle(out, kinds, spans, entity.style, '');
				firstLine = open;
				lastLine = close;
				// The entity script sits outside the style range — own its lines
				// explicitly so exactly one virtual doc speaks for them.
				extraOwnedLines = entityScriptLines();
			} else {
				// Script, no style: this doc owns the script's lines.
				firstLine = lineOfOffset(starts, entityScript!.span.start);
				lastLine = lineOfOffset(starts, Math.max(entityScript!.span.start, entityScript!.span.end - 1));
			}

			const trailer = [
				'{#if false}',
				...names.map((n) => `{@render ${n}({})}`),
				'{/if}',
			];
			projections.push({
				key: `${e}`,
				firstLine,
				lastLine,
				extraOwnedLines,
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
				contentSpans: spans,
			});
		}

		// A DOC per-entity doc owns the whole entity range (its copy of example
		// markup must not speak for the example lines), so every example needs
		// its own doc — even script-less ones — whenever the entity doc exists.
		const entityDocOwnsBody = entity.kind === 'DOC' && !!entity.style;

		entity.blocks.forEach((block, b) => {
			if (!block.script && !block.style && !entityScript && !entityDocOwnsBody) return;

			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
			const spans: (RecomposedSpan | undefined)[] = new Array(total);
			const copyVerbatim = (span: Span) => {
				const first = lineOfOffset(starts, span.start);
				const last = lineOfOffset(starts, Math.max(span.start, span.end - 1));
				for (let l = first; l <= last; l++) {
					out[l] = lineTextOf(l);
					kinds[l] = 'verbatim';
				}
			};

			const name = `__sdocs$${e}_${b}`;
			const argsParam = argsParamOf(block.script);
			const openerLine = lineOfOffset(starts, block.openerSpan.start);
			const closerLine = lineOfOffset(starts, Math.max(block.span.start, block.span.end - 1));

			const scripts = [file.script, entityScript, block.script].filter(
				(x): x is TagBlockLike => !!x,
			);
			if (scripts.length > 0) {
				const { closeLine } = buildChain(out, kinds, spans, scripts);
				if (block.script) {
					// The block script's closer opens the snippet.
					out[closeLine] = `${out[closeLine]}</script>{#snippet ${name}${argsParam}}`;
				} else {
					// No block script: close the chain at the last outer script and
					// open the snippet on the block opener line, as the base does.
					out[closeLine] = `${out[closeLine]}</script>`;
					out[openerLine] = `{#snippet ${name}${argsParam}}`;
					kinds[openerLine] = 'wrapper';
				}
			} else {
				out[openerLine] = `{#snippet ${name}${argsParam}}`;
				kinds[openerLine] = 'wrapper';
			}

			if (block.markupSpan.end > block.markupSpan.start) copyVerbatim(block.markupSpan);

			if (block.style) {
				emitStyle(out, kinds, spans, block.style, '{/snippet}');
			} else {
				out[closerLine] = '{/snippet}';
				kinds[closerLine] = 'wrapper';
			}

			const trailer = ['{#if false}', `{@render ${name}({})}`, '{/if}'];
			// The entity script's lines are always owned by the per-entity doc,
			// so block docs claim exactly their own opener→closer range.
			projections.push({
				key: `${e}_${b}`,
				firstLine: openerLine,
				lastLine: closerLine,
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
				contentSpans: spans,
			});
		});
	});

	return projections;
}
