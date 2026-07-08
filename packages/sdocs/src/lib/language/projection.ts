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
	/** Extra owned lines outside the range — e.g. the entity script an inner
	 * block's markup depends on. Each line has exactly one owner overall. */
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
 * Project each script/style-bearing block — and each PAGE/LAYOUT entity with
 * its own script/style — into a line-preserving virtual Svelte document.
 * Scripts CHAIN lexically: file → entity → block concatenate into one
 * component script, byte-compatible with the runtime build. Single-line tags
 * and content sharing a closer line are recomposed, never dropped.
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

	file.entities.forEach((entity, e) => {
		const entityScript = entity.script;

		/** Copy the chained scripts into out[], returning the line that must
		 * carry the `</script>` (the last script's closer) and the lines the
		 * entity script occupies (for ownership). */
		const buildChain = (
			out: string[],
			kinds: ProjectedLineKind[],
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
				// Content sharing the closer line survives the rewrite.
				const tail = source.slice(
					Math.max(starts[closerLine], sc.contentSpan.start),
					sc.contentSpan.end,
				);
				if (i === 0) {
					// The outermost script provides the real opener.
					const langFix = isTs && !TS_RE.test(sc.attrsText) ? ' lang="ts"' : '';
					if (openLine === closerLine) {
						// Single-line: recompose opener + content, drop the closer.
						out[closerLine] = `<script${sc.attrsText}${langFix}>${tail}`;
						kinds[closerLine] = 'wrapper';
						opensHere = '';
					} else {
						if (langFix) {
							const lineEnd = openLine + 1 < total ? starts[openLine + 1] - 1 : source.length;
							const openTail = source.slice(
								Math.min(sc.contentSpan.start, lineEnd),
								Math.min(sc.contentSpan.end, lineEnd),
							);
							out[openLine] = `<script${sc.attrsText}${langFix}>${openTail}`;
							kinds[openLine] = 'wrapper';
						} else {
							out[openLine] = lineTextOf(openLine);
							kinds[openLine] = 'verbatim';
						}
						out[closerLine] = tail;
						kinds[closerLine] = 'wrapper';
					}
				} else {
					// Inner scripts: the opener tag goes blank (we are inside the
					// merged region), but content sharing the opener or closer line
					// is recomposed at its authored column, never dropped.
					const columnOf = (line: number) => sc.contentSpan.start - starts[line];
					if (openLine !== closerLine) {
						const lineEnd = openLine + 1 < total ? starts[openLine + 1] - 1 : source.length;
						const head = source.slice(
							Math.min(sc.contentSpan.start, lineEnd),
							Math.min(sc.contentSpan.end, lineEnd),
						);
						out[openLine] = head ? ' '.repeat(columnOf(openLine)) + head : '';
						kinds[openLine] = 'wrapper';
						out[closerLine] = tail;
					} else {
						out[closerLine] = tail ? ' '.repeat(columnOf(closerLine)) + tail : '';
					}
					kinds[closerLine] = 'wrapper';
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
		let entityLinesAssigned = false;

		// PAGE/LAYOUT with an entity script/style: the body IS the content.
		if ((entity.kind === 'PAGE' || entity.kind === 'LAYOUT') && (entity.script || entity.style)) {
			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
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
				const { closeLine } = buildChain(out, kinds, scripts);
				out[closeLine] = `${out[closeLine]}</script>`;
			}
			if (entity.bodySpan.end > entity.bodySpan.start) copyVerbatim(entity.bodySpan);
			if (entity.style) {
				const styleOpen = lineOfOffset(starts, entity.style.span.start);
				const styleClose = lineOfOffset(starts, Math.max(entity.style.span.start, entity.style.span.end - 1));
				if (entity.style.contentSpan.end > entity.style.contentSpan.start) {
					copyVerbatim(entity.style.contentSpan);
				}
				const tail = source.slice(
					Math.max(starts[styleClose], entity.style.contentSpan.start),
					entity.style.contentSpan.end,
				);
				if (styleOpen !== styleClose) {
					out[styleOpen] = '<style>';
					kinds[styleOpen] = 'wrapper';
					out[styleClose] = `${tail}</style>`;
				} else {
					out[styleClose] = `<style>${tail}</style>`;
				}
				kinds[styleClose] = 'wrapper';
			}
			const firstLine = lineOfOffset(starts, entity.openerSpan.start);
			const lastLine = lineOfOffset(starts, Math.max(entity.span.start, entity.span.end - 1));
			projections.push({
				key: `${e}`,
				firstLine,
				lastLine,
				text: out.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
			});
			return;
		}

		// DOC with an entity script/style: a per-entity doc carries the chained
		// file→entity script, the masked prose (islands and {expressions} live),
		// and the entity style — so prose diagnostics see the entity scope, and
		// script/style errors surface even with zero [example] blocks. Example
		// lines stay blank here; each example has its own per-block doc.
		if (entity.kind === 'DOC' && (entityScript || entity.style)) {
			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
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
				const { closeLine } = buildChain(out, kinds, scripts);
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

			for (const block of entity.blocks) {
				const bOpen = lineOfOffset(starts, block.openerSpan.start);
				const bClose = lineOfOffset(starts, Math.max(block.span.start, block.span.end - 1));
				maskLines(proseFrom, bOpen - 1);
				proseFrom = bClose + 1;
			}

			if (entity.style) {
				const styleOpen = lineOfOffset(starts, entity.style.span.start);
				const styleClose = lineOfOffset(starts, Math.max(entity.style.span.start, entity.style.span.end - 1));
				maskLines(proseFrom, styleOpen - 1);
				if (entity.style.contentSpan.end > entity.style.contentSpan.start) {
					copyVerbatim(entity.style.contentSpan);
				}
				const tail = source.slice(
					Math.max(starts[styleClose], entity.style.contentSpan.start),
					entity.style.contentSpan.end,
				);
				if (styleOpen !== styleClose) {
					out[styleOpen] = '{/snippet}<style>';
					kinds[styleOpen] = 'wrapper';
					out[styleClose] = `${tail}</style>`;
				} else {
					out[styleClose] = `{/snippet}<style>${tail}</style>`;
				}
				kinds[styleClose] = 'wrapper';
			} else {
				maskLines(proseFrom, closerLine - 1);
				out[closerLine] = '{/snippet}';
				kinds[closerLine] = 'wrapper';
			}

			const trailer = ['{#if false}', `{@render ${name}()}`, '{/if}'];
			projections.push({
				key: `${e}`,
				firstLine: openFirst,
				lastLine: closerLine,
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
			});
			// The entity doc owns the entity script lines (its range covers
			// them); per-block docs must not claim them via extraOwnedLines.
			entityLinesAssigned = true;
		}

		// SHOWCASE: the entity <style> needs a doc to live in — checked against
		// every block's markup, matching the runtime merge of entity style into
		// each preview/example component. An entity script with no blocks would
		// otherwise never be checked anywhere, so it gets the doc too.
		if (
			entity.kind === 'SHOWCASE' &&
			(entity.style || (entityScript && entity.blocks.length === 0))
		) {
			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
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
				const { closeLine } = buildChain(out, kinds, scripts);
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
			if (entity.style) {
				const styleOpen = lineOfOffset(starts, entity.style.span.start);
				const styleClose = lineOfOffset(starts, Math.max(entity.style.span.start, entity.style.span.end - 1));
				if (entity.style.contentSpan.end > entity.style.contentSpan.start) {
					copyVerbatim(entity.style.contentSpan);
				}
				const tail = source.slice(
					Math.max(starts[styleClose], entity.style.contentSpan.start),
					entity.style.contentSpan.end,
				);
				if (styleOpen !== styleClose) {
					out[styleOpen] = '<style>';
					kinds[styleOpen] = 'wrapper';
					out[styleClose] = `${tail}</style>`;
				} else {
					out[styleClose] = `<style>${tail}</style>`;
				}
				kinds[styleClose] = 'wrapper';
				firstLine = styleOpen;
				lastLine = styleClose;
			} else {
				// Script-only, zero blocks: this doc owns the script's lines.
				firstLine = lineOfOffset(starts, entityScript!.span.start);
				lastLine = lineOfOffset(starts, Math.max(entityScript!.span.start, entityScript!.span.end - 1));
			}
			if (entity.blocks.length === 0 && entityScript) {
				// No block doc exists to claim the entity script lines — widen
				// the owned range to include them.
				firstLine = Math.min(firstLine, lineOfOffset(starts, entityScript.span.start));
				entityLinesAssigned = true;
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
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
			});
		}

		// A DOC per-entity doc blanks its example lines, so every example needs
		// its own doc — even script-less ones — whenever the entity doc exists.
		const entityDocOwnsBody = entity.kind === 'DOC' && !!entity.style;

		entity.blocks.forEach((block, b) => {
			if (!block.script && !block.style && !entityScript && !entityDocOwnsBody) return;

			const out: string[] = new Array(total).fill('');
			const kinds: ProjectedLineKind[] = new Array(total).fill('blank');
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
				const { closeLine } = buildChain(out, kinds, scripts);
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
				const styleOpenLine = lineOfOffset(starts, block.style.span.start);
				const styleCloseLine = lineOfOffset(starts, Math.max(block.style.span.start, block.style.span.end - 1));
				if (block.style.contentSpan.end > block.style.contentSpan.start) {
					copyVerbatim(block.style.contentSpan);
				}
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
			} else {
				out[closerLine] = '{/snippet}';
				kinds[closerLine] = 'wrapper';
			}

			const trailer = ['{#if false}', `{@render ${name}({})}`, '{/if}'];
			// The first doc of an entity also owns the entity script's lines, so
			// exactly one virtual doc speaks for them.
			const extraOwnedLines = !entityLinesAssigned ? entityScriptLines() : [];
			if (extraOwnedLines.length > 0) entityLinesAssigned = true;
			projections.push({
				key: `${e}_${b}`,
				firstLine: openerLine,
				lastLine: closerLine,
				extraOwnedLines,
				text: out.join('\n') + '\n' + trailer.join('\n') + '\n',
				sourceLineCount: total,
				lineKinds: kinds,
			});
		});
	});

	return projections;
}
