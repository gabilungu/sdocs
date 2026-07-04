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

/** Mask markdown code so a PAGE body reads as Svelte-safe prose: fence lines
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
	const argsParam = isTs ? '(args: Record<string, any>)' : '(args)';

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

	file.entities.forEach((entity: Entity, e: number) => {
		if (entity.kind === 'DOCS') {
			entity.blocks.forEach((block: SubBlock, b: number) => {
				wrapBlock(`__sdocs$${e}_${b}`, block.openerSpan, block.bodySpan, block.span, true, false);
				const component = block.attrs.component;
				if (component?.kind === 'expression') {
					const name = component.raw.trim();
					if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) componentRefs.add(name);
				}
			});
		} else {
			wrapBlock(
				`__sdocs$${e}`,
				entity.openerSpan,
				entity.bodySpan,
				entity.span,
				false,
				entity.kind === 'PAGE',
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
