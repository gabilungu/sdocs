/**
 * Rewriting a `[NOTES]` or `[TODO]` block in `.sdoc` source.
 *
 * The dev server lets a reader add notes and tick todos from the Explorer,
 * which means editing the file they are reading. The edit is deliberately the
 * smallest one that can be made: a note edit replaces the block's own span and
 * a tick rewrites one character, so a document keeps its formatting, its
 * comments, and every byte the author put there.
 *
 * Kept apart from the middleware that calls it so the interesting half — find
 * the block, splice the text — is a pure function of source text.
 */

import { scanSdoc, type Attrs, type Entity, type SubBlock } from '../language/scanner.js';
import { slugifyTitle } from '../language/parser.js';
import type { DocNote, TodoItem } from '../types.js';

export interface NoteTarget {
	/** Slug of the entity to edit, as the Explorer knows it. */
	entitySlug: string;
	/** Title of an `[example]` inside that entity, to edit its notes instead
	 * of the entity's own. */
	exampleTitle?: string | null;
}

export class NoteTargetError extends Error {}

/** The text blocks that can be written back from the Explorer. */
type EditableBlock = 'notes' | 'todo';

/**
 * A `[NOTES]` block, or '' when there is nothing to write.
 *
 * `base` is the indentation the block sits at — one level inside its entity or
 * example. A note's text is written verbatim on one line: the block's grammar
 * is one note per line, so a newline inside a note would split it in two.
 */
export function serializeNotes(notes: DocNote[], base: string): string {
	if (notes.length === 0) return '';
	const lines = notes.map((n) => {
		const text = n.note.replace(/\r?\n/g, ' ').trim();
		return `${base}\t- ${n.type ? `${n.type}: ` : ''}${text}`;
	});
	return [`${base}[NOTES]`, ...lines, `${base}[/NOTES]`].join('\n');
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
interface Located {
	/** The opener a new [NOTES] block goes under. */
	openerSpan: { start: number; end: number };
	/** The [NOTES] block already there, if any. */
	notesSpan: { start: number; end: number } | null;
	/** What a block one level inside this opener is indented by. */
	bodyIndent: string;
}

const nestedOpenerRe = (tag: string) => new RegExp(`^[ \\t]*\\[${tag}\\][ \\t]*$`, 'im');

function locate(
	source: string,
	entities: Entity[],
	target: NoteTarget,
	kind: EditableBlock = 'notes',
): Located {
	const entity = entities.find((e) => slugifyTitle(titleOf(e.attrs)) === target.entitySlug);
	if (!entity) {
		throw new NoteTargetError(`No entity with the slug "${target.entitySlug}" in this file.`);
	}
	// A [PAGE] or [LAYOUT] body is captured whole as Svelte markup, so a block
	// written into one is never read back — it renders as literal text on the
	// page. Refusing here closes both write paths at once: the Explorer's note
	// button and the MCP tools both arrive through this function. A [PATTERNS]
	// is not in this list: it holds blocks, exactly as a [SHOWCASE] does.
	if (entity.kind === 'PAGE' || entity.kind === 'LAYOUT') {
		throw new NoteTargetError(
			`A [${entity.kind}] body is Svelte markup, so it cannot hold a [${kind.toUpperCase()}] — the block would render as text.`,
		);
	}
	const indentOf = (offset: number) => lineIndent(source, offset);

	if (!target.exampleTitle) {
		const block = entity.blocks.find((b: SubBlock) => b.kind === kind);
		return {
			openerSpan: entity.openerSpan,
			notesSpan: block ? block.span : null,
			bodyIndent: `${indentOf(entity.openerSpan.start)}\t`,
		};
	}

	const example = entity.blocks.find(
		(b: SubBlock) => b.kind === 'example' && titleOf(b.attrs) === target.exampleTitle,
	);
	if (!example) {
		throw new NoteTargetError(
			`No [EXAMPLE] titled "${target.exampleTitle}" in "${titleOf(entity.attrs)}".`,
		);
	}
	// An example's text blocks live inside its body, which the scanner captures
	// whole rather than nesting — so they are found by scanning that span.
	const tag = kind.toUpperCase();
	const closer = `[/${tag}]`;
	const body = source.slice(example.bodySpan.start, example.bodySpan.end);
	const open = nestedOpenerRe(tag).exec(body);
	let notesSpan: { start: number; end: number } | null = null;
	if (open) {
		const closeAt = body.toUpperCase().indexOf(closer, open.index);
		if (closeAt !== -1) {
			notesSpan = {
				start: example.bodySpan.start + open.index + (open[0].length - open[0].trimStart().length),
				end: example.bodySpan.start + closeAt + closer.length,
			};
		}
	}
	return {
		openerSpan: example.openerSpan,
		notesSpan,
		bodyIndent: `${indentOf(example.openerSpan.start)}\t`,
	};
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
	const { openerSpan, notesSpan, bodyIndent } = locate(source, file.entities, target);
	return splice(source, openerSpan, notesSpan, serializeNotes(notes, bodyIndent));
}

/**
 * Put `text` where `blockSpan` is, or just under `openerSpan` when there is no
 * block yet, or take the block out when `text` is empty.
 *
 * Shared by both writers: a `[NOTES]` and a `[TODO]` sit in the same place and
 * are replaced the same way — only what goes in them differs.
 */
function splice(
	source: string,
	openerSpan: { start: number; end: number },
	blockSpan: { start: number; end: number } | null,
	text: string,
): string {
	const notesSpan = blockSpan;

	// Replace the block that is there.
	if (notesSpan) {
		if (!text) {
			// Take the whole line, and the blank line after it if the removal
			// would otherwise leave two in a row.
			let from = notesSpan.start;
			while (from > 0 && source[from - 1] !== '\n') from--;
			let to = notesSpan.end;
			while (to < source.length && source[to] !== '\n') to++;
			to = Math.min(to + 1, source.length);
			if (source.slice(to).startsWith('\n') && source.slice(0, from).endsWith('\n\n')) to++;
			return source.slice(0, from) + source.slice(to);
		}
		let from = notesSpan.start;
		while (from > 0 && source[from - 1] !== '\n') from--;
		return source.slice(0, from) + text + source.slice(notesSpan.end);
	}
	if (!text) return source;

	// Otherwise open one directly under the opener, where it renders: notes sit
	// above everything else the block holds.
	let after = openerSpan.end;
	while (after < source.length && source[after] !== '\n') after++;
	after = Math.min(after + 1, source.length);
	const blank = source.slice(after).startsWith('\n') ? '' : '\n';
	return `${source.slice(0, after)}\n${text}\n${blank}${source.slice(after)}`;
}

/**
 * Return `source` with the todo at `path` ticked or unticked.
 *
 * `path` addresses the item by position at each level — `[1, 0]` is the first
 * child of the second root item — which is what the rendered checklist knows
 * about itself. Only the mark between the brackets is rewritten: one character
 * in, one character out, so a tick never reflows the author's text.
 */
export function toggleTodo(
	source: string,
	target: NoteTarget,
	path: number[],
	done: boolean,
): string {
	const file = scanSdoc(source);
	const { notesSpan } = locate(source, file.entities, target, 'todo');
	if (!notesSpan) throw new NoteTargetError('No [TODO] block to tick.');

	// The same shape the parser builds, carrying each item's mark offset
	// instead of its text — indentation opens a level, one line is one item.
	interface Marked {
		at: number;
		children: Marked[];
	}
	const roots: Marked[] = [];
	const stack: { indent: number; items: Marked[] }[] = [{ indent: -1, items: roots }];
	let offset = notesSpan.start;
	for (const raw of source.slice(notesSpan.start, notesSpan.end).split('\n')) {
		const lineStart = offset;
		offset += raw.length + 1;
		const m = /^([ \t]*)- \[([ xX])\]/.exec(raw);
		if (!m) continue;
		const indent = m[1].replace(/\t/g, ' ').length;
		while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
		const item: Marked = { at: lineStart + m[1].length + '- ['.length, children: [] };
		stack[stack.length - 1].items.push(item);
		stack.push({ indent, items: item.children });
	}

	let level = roots;
	let item: Marked | undefined;
	for (const i of path) {
		item = level[i];
		if (!item) throw new NoteTargetError(`No todo at ${path.join('.')} in this [TODO] block.`);
		level = item.children;
	}
	if (!item) throw new NoteTargetError('A todo path cannot be empty.');
	return source.slice(0, item.at) + (done ? 'x' : ' ') + source.slice(item.at + 1);
}

/**
 * A `[TODO]` block, or '' when the list is empty.
 *
 * `base` is the indentation the block sits at; each level of nesting adds one
 * tab inside it, because indentation is what nests one item under another.
 */
export function serializeTodos(items: TodoItem[], base: string): string {
	if (items.length === 0) return '';
	const lines: string[] = [];
	const walk = (list: TodoItem[], depth: number) => {
		for (const item of list) {
			const text = item.text.replace(/\r?\n/g, ' ').trim();
			lines.push(`${base}\t${'\t'.repeat(depth)}- [${item.done ? 'x' : ' '}] ${text}`);
			walk(item.children, depth + 1);
		}
	};
	walk(items, 0);
	return [`${base}[TODO]`, ...lines, `${base}[/TODO]`].join('\n');
}

/**
 * Return `source` with the target's `[TODO]` carrying exactly `items`.
 *
 * The whole block is re-serialized, unlike `toggleTodo` — this is the path for
 * edits that change the list's shape (text, an added item, a removed one),
 * where there is nothing smaller to rewrite. Emptying the list removes the
 * block rather than leaving an empty one behind.
 */
export function writeTodos(source: string, target: NoteTarget, items: TodoItem[]): string {
	const file = scanSdoc(source);
	const { openerSpan, notesSpan, bodyIndent } = locate(source, file.entities, target, 'todo');
	return splice(source, openerSpan, notesSpan, serializeTodos(items, bodyIndent));
}

/** Which `[COMPONENT]` to edit: the entity it lives in, and the component it
 * documents (the `component={X}` identifier, or the `title="…"` tab label when
 * one entity previews the same component twice). */
export interface ComponentTarget {
	entitySlug: string;
	component: string;
}

/**
 * Return `source` with the target `[COMPONENT]`'s `status` set to `status`, or
 * with the attribute removed when it is null.
 *
 * The one attribute writer left in this module. Notes and todos became blocks
 * in 0.0.139; a status is genuinely an attribute — a single word about the
 * component rather than something written *inside* it — so it is spliced the
 * way the notes attribute used to be: the attribute's own span and nothing
 * else, or just inside the opener's closing bracket when there is none yet.
 */
export function writeStatus(
	source: string,
	target: ComponentTarget,
	status: string | null,
): string {
	const file = scanSdoc(source);
	const entity = file.entities.find((e) => slugifyTitle(titleOf(e.attrs)) === target.entitySlug);
	if (!entity) {
		throw new NoteTargetError(`No entity with the slug "${target.entitySlug}" in this file.`);
	}
	const wanted = target.component.trim();
	const block = entity.blocks.find((b: SubBlock) => {
		if (b.kind !== 'preview') return false;
		const component = b.attrs['component'];
		const name = component && component.kind === 'expression' ? component.raw.trim() : '';
		return name === wanted || titleOf(b.attrs) === wanted;
	});
	if (!block) {
		throw new NoteTargetError(
			`No [COMPONENT] for "${wanted}" in "${titleOf(entity.attrs)}" — name it by its component={…} identifier or its title="…".`,
		);
	}

	const existing = block.attrs['status'];
	if (existing) {
		if (status) {
			return source.slice(0, existing.valueSpan.start) + status + source.slice(existing.valueSpan.end);
		}
		// Take the whitespace before it too, or removing the attribute leaves a
		// double space inside the opener.
		let from = existing.span.start;
		while (from > 0 && (source[from - 1] === ' ' || source[from - 1] === '\t')) from--;
		return source.slice(0, from) + source.slice(existing.span.end);
	}
	if (!status) return source;

	// No attribute yet: write one just inside the opener's closing bracket.
	const close = source.lastIndexOf(']', block.openerSpan.end - 1);
	if (close === -1) throw new NoteTargetError('That [COMPONENT] opener has no closing bracket.');
	// A wrapped opener closes on a line of its own, one attribute per line.
	const lineStart = source.lastIndexOf('\n', close) + 1;
	const wrapped = source.slice(lineStart, close).trim() === '';
	const indent = source.slice(lineStart, close);
	return wrapped
		? `${source.slice(0, lineStart)}${indent}\tstatus="${status}"\n${source.slice(lineStart)}`
		: `${source.slice(0, close)} status="${status}"${source.slice(close)}`;
}
