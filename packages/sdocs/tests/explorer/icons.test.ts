/**
 * Every icon name the UI asks for has to exist.
 *
 * A missing one fails silently — `Icon` renders an empty span, so a status
 * glyph or a note mark just is not there, and nothing in a build or a
 * typecheck says so. The names live in string maps, which typescript cannot
 * check against the registry either.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../src/lib');
const iconSource = readFileSync(resolve(root, 'ui/Icon/Icon.svelte'), 'utf-8');

/** The registry, as `name -> imported file`. */
function registry(): Map<string, string> {
	const files = new Map<string, string>();
	for (const [, variable, path] of iconSource.matchAll(
		/import (\w+) from '\.\/(icons\/[\w/-]+\.svg)\?raw';/g,
	)) {
		files.set(variable, path);
	}
	const names = new Map<string, string>();
	for (const [, name, variable] of iconSource.matchAll(/'([\w-]+)':\s*(\w+Svg),/g)) {
		const path = files.get(variable);
		if (path) names.set(name, path);
	}
	return names;
}

/** Icon names referenced from a component's `{ icon: '…' }` map or `name="…"`. */
function referenced(file: string): string[] {
	const source = readFileSync(resolve(root, file), 'utf-8');
	return [
		...[...source.matchAll(/icon: '([\w-]+)'/g)].map((m) => m[1]),
		...[...source.matchAll(/name="([\w-]+)"/g)].map((m) => m[1]),
		...[...source.matchAll(/^\t\t(\w+): '([\w-]+)',$/gm)].map((m) => m[2]),
	];
}

describe('the icon registry', () => {
	const icons = registry();

	it('registers every icon against a file that exists', () => {
		expect(icons.size).toBeGreaterThan(20);
		const missing = [...icons].filter(([, path]) => !existsSync(resolve(root, 'ui/Icon', path)));
		expect(missing).toEqual([]);
	});

	// The two semantic sets are Font Awesome Free; everything else is Lucide.
	// Mixing them is deliberate, and the prefix is what keeps it legible.
	it('namespaces the Font Awesome icons, and takes them only from the free set', () => {
		const fa = [...icons].filter(([name]) => name.startsWith('fa-'));
		// Derived rather than a fixed number: the count changes whenever a glyph
		// is chosen differently, and a magic number just becomes a chore.
		const onDisk = readdirSync(resolve(root, 'ui/Icon/icons/fa')).filter((f) => f.endsWith('.svg'));
		expect(fa.length).toBe(onDisk.length);
		expect(fa.length).toBeGreaterThan(5);
		for (const [name, path] of fa) {
			expect(path, name).toContain('icons/fa/');
			const svg = readFileSync(resolve(root, 'ui/Icon', path), 'utf-8');
			// The attribution CC BY 4.0 requires, kept in the file so it travels
			// into the bundle with the icon.
			expect(svg, name).toContain('Font Awesome Free');
			expect(svg, name).not.toContain('Font Awesome Pro');
		}
	});

	// `.sdoc` included: the Icon showcase lists every glyph by name, and it is
	// the one file guaranteed to reference an icon that was just renamed.
	it.each([
		['explorer/views/ComponentView.svelte'],
		['ui/Note/Note.svelte'],
		['explorer/views/NoteControl.svelte'],
		['explorer/views/Sidebar.svelte'],
		['ui/Icon/Icon.sdoc'],
	])('resolves every icon %s asks for', (file) => {
		const unknown = referenced(file).filter((name) => !icons.has(name));
		expect(unknown).toEqual([]);
	});

	it('leaves no icon file unregistered', () => {
		const used = new Set([...icons.values()].map((p) => p.split('/').pop()));
		const dirs = ['ui/Icon/icons', 'ui/Icon/icons/fa'];
		const orphans: string[] = [];
		for (const dir of dirs) {
			const full = resolve(root, dir);
			for (const file of readdirSync(full)) {
				if (file.endsWith('.svg') && !used.has(file)) orphans.push(`${dir}/${file}`);
			}
		}
		expect(orphans).toEqual([]);
	});
});
