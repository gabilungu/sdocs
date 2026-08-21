/**
 * Rewriting an opener's `notes` attribute in `.sdoc` source.
 *
 * The dev server lets a reader add and edit notes from the Explorer, which
 * means editing the file they are reading. The edit is deliberately the
 * smallest one that can be made: the attribute's own span is replaced and
 * nothing else in the file is re-serialized, so a document keeps its
 * formatting, its comments, and every byte the author put there.
 *
 * Kept apart from the middleware that calls it so the interesting half — find
 * the opener, splice the attribute — is a pure function of source text.
 */

import { scanSdoc, type Attrs, type Entity, type SubBlock } from '../language/scanner.js';
import { slugifyTitle } from '../language/parser.js';
import type { DocNote } from '../types.js';

export interface NoteTarget {
	/** Slug of the entity to edit, as the Explorer knows it. */
	entitySlug: string;
	/** Title of an `[example]` inside that entity, to edit its notes instead
	 * of the entity's own. */
	exampleTitle?: string | null;
}

export class NoteTargetError extends Error {}

/** A single-quoted literal for the attribute source. */
function quote(text: string): string {
	return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * The `notes={[…]}` attribute text, or '' when there is nothing to write.
 *
 * `base` is the indentation the attribute itself sits at — the opener's own
 * for an attribute written on the opener line, one tab deeper when the opener
 * is already wrapped one-attribute-per-line. A wrapped list indents from
 * there, so it lines up whichever shape it lands in.
 */
export function serializeNotes(notes: DocNote[], base: string): string {
	if (notes.length === 0) return '';
	const entries = notes.map(
		(n) => `{ note: ${quote(n.note)}${n.intent ? `, intent: ${quote(n.intent)}` : ''} }`,
	);
	const oneLine = `notes={[${entries.join(', ')}]}`;
	if (base.length + oneLine.length <= 100 && entries.length === 1) return oneLine;
	return `notes={[\n${entries.map((e) => `${base}\t${e},`).join('\n')}\n${base}]}`;
}

/** The whitespace opening the line `offset` sits on — what the opener is
 * indented by, so an attribute written under it lines up. */
function lineIndent(source: string, offset: number): string {
	const start = source.lastIndexOf('\n', offset - 1) + 1;
	return source.slice(start, offset).match(/^[\t ]*/)?.[0] ?? '';
}

function titleOf(attrs: Attrs): string {
	const title = attrs['title'];
	return title && title.kind === 'string' ? title.raw : '';
}

/** The entity and, optionally, the example block the target names. */
function locate(
	entities: Entity[],
	target: NoteTarget,
): { attrs: Attrs; openerSpan: { start: number; end: number } } {
	const entity = entities.find((e) => slugifyTitle(titleOf(e.attrs)) === target.entitySlug);
	if (!entity) {
		throw new NoteTargetError(`No entity with the slug "${target.entitySlug}" in this file.`);
	}
	if (!target.exampleTitle) return { attrs: entity.attrs, openerSpan: entity.openerSpan };

	const example = entity.blocks.find(
		(b: SubBlock) => b.tag === 'example' && titleOf(b.attrs) === target.exampleTitle,
	);
	if (!example) {
		throw new NoteTargetError(
			`No [example] titled "${target.exampleTitle}" in "${titleOf(entity.attrs)}".`,
		);
	}
	return { attrs: example.attrs, openerSpan: example.openerSpan };
}

/**
 * Return `source` with the target opener's `notes` carrying exactly `notes`.
 *
 * Replaces the attribute where one is already written, removes it when the
 * list is emptied, and otherwise adds it just inside the opener's closing
 * bracket. Throws `NoteTargetError` when the target names nothing.
 */
export function writeNotes(source: string, target: NoteTarget, notes: DocNote[]): string {
	const file = scanSdoc(source);
	const { attrs, openerSpan } = locate(file.entities, target);
	const existing = attrs['notes'];
	const indent = lineIndent(source, openerSpan.start);
	// An opener already broken across lines carries its attributes one tab in;
	// one written on a single line carries them at its own indentation.
	const close = source.lastIndexOf(']', openerSpan.end - 1);
	const wrapped = source.slice(openerSpan.start, close).includes('\n');
	const text = serializeNotes(notes, wrapped ? `${indent}\t` : indent);

	if (existing) {
		if (!text) {
			// Take the space in front of it too, or removing the last attribute
			// leaves the opener padded: `[DOC title="X" ]`.
			let from = existing.span.start;
			while (from > openerSpan.start && /[\t ]/.test(source[from - 1])) from--;
			// A wrapped opener puts each attribute on its own line — the line
			// it had goes with it.
			if (source[from - 1] === '\n' && source[existing.span.end] === '\n') from--;
			return source.slice(0, from) + source.slice(existing.span.end);
		}
		return source.slice(0, existing.span.start) + text + source.slice(existing.span.end);
	}
	if (!text) return source;

	// Just inside the opener's closing bracket, matching how the opener is
	// already written: one more attribute on the line, or one more line.
	const after = source.slice(close);
	// Trailing layout between the last attribute and the bracket is replaced,
	// not added to: the wrapped form already ends its line, and adding another
	// newline would open a blank one in the middle of the opener.
	const before = source.slice(0, close).replace(wrapped ? /\s*$/ : /[\t ]*$/, '');
	return wrapped
		? `${before}\n${indent}\t${text}\n${indent}${after}`
		: `${before} ${text}${after}`;
}
