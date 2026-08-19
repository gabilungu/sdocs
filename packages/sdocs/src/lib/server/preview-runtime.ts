/**
 * The bit of the preview page that exists for automation.
 *
 * A stage page is a real, directly-navigable document — an agent driving a
 * browser can open one and photograph a single component instead of the whole
 * Explorer, which is the difference between a ~2000-token screenshot and a
 * ~2-token one. Two things make that reliable, and neither can be guessed from
 * outside the page: *when* the stage is done rendering, and *how far past its
 * own box* a component actually paints.
 */

import { sep } from 'node:path';

/** A short, stable handle for one stage — the thing a person can read off the
 * screen and say out loud ("look at sdocs:k3f9a"). Derived from the same
 * identity the preview URL encodes, so it never becomes a second naming
 * scheme to keep in sync; it's a nickname for a route, not a new address. */
export function stageId(relPathWithSlugs: string): string {
	// FNV-1a, 32-bit — tiny, dependency-free, and stable across machines and
	// releases, which matters because these ids end up in conversations.
	let hash = 0x811c9dc5;
	for (let i = 0; i < relPathWithSlugs.length; i++) {
		hash ^= relPathWithSlugs.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(36).padStart(5, '0').slice(-5);
}

/** The identity string a stage id hashes: doc path + entity + snippet.
 *
 * Deliberately the **absolute** path. A relative one would have to agree on a
 * root, and the two callers don't have the same one — the dev server encodes
 * against its staging directory, the MCP server against the project — which
 * would hand a person one id on screen and the tool a different id for the
 * same stage. Nothing leaks: the hash is five characters and never ships in a
 * built site. */
export function stageIdentity(filePath: string, entitySlug: string, snippetSlug: string): string {
	return `${filePath.split(sep).join('/')}#${entitySlug}/${snippetSlug}`;
}

export interface StageIdentityAttrs {
	id: string;
	kind: string;
	name: string;
	component?: string | null;
}

/** One photographable stage: what it is, what it shows, and how to address it.
 * Dev, build, and the MCP server all describe stages through this, so a stage
 * id means the same thing wherever it's printed. */
export interface StageDescriptor extends StageIdentityAttrs {
	/** URL segment within the entity */
	slug: string;
}

/** Map a planned snippet's internal role onto the word an author would use. */
function stageKind(role: string, entityKind: string): string {
	if (role === 'preview') return 'component';
	if (role === 'example') return 'example';
	return entityKind.toLowerCase();
}

/** Describe every stage of one entity that has its own preview page. */
export function describeStages(
	entity: { kind: string; slug: string },
	planned: Array<{ slug: string; name: string; role: string; componentName?: string | null }>,
	filePath: string,
): StageDescriptor[] {
	return planned.map((s) => ({
		slug: s.slug,
		id: stageId(stageIdentity(filePath, entity.slug, s.slug)),
		kind: stageKind(s.role, entity.kind),
		name: s.name,
		component: s.componentName ?? null,
	}));
}

/** `<html>` attributes carrying the stage's identity into the document, so the
 * page can answer "what am I?" without the caller decoding a URL. */
export function stageAttrs(stage: StageIdentityAttrs | null): string {
	if (!stage) return '';
	const esc = (v: string) =>
		v
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	return (
		` data-sdocs-stage-id="${esc(stage.id)}" data-sdocs-stage-kind="${esc(stage.kind)}"` +
		` data-sdocs-stage-name="${esc(stage.name)}"` +
		(stage.component ? ` data-sdocs-component="${esc(stage.component)}"` : '')
	);
}

/**
 * Runs before the stage module, so a stage that fails to even load still ends
 * up in a state an automated client can read instead of hanging on a selector
 * that will never appear. A blank page and a broken page look identical from
 * outside; this makes them distinguishable.
 */
export const PREVIEW_BOOTSTRAP_JS = `
(function () {
	var root = document.documentElement;

	// The reader's customization picks, applied before the first paint.
	// Waiting for the parent to message them would show one frame of the
	// default theme on every stage that mounts after a switch — a route
	// change, a lazy stage, a fullscreen remount. Same-origin holds for dev
	// and built previews alike; a direct visit has no parent to ask.
	try {
		var picks = window.parent !== window && window.parent.__sdocsAxes;
		if (picks) for (var id in picks) root.setAttribute('data-' + id, picks[id]);
		var scale = window.parent !== window && window.parent.__sdocsScale;
		if (scale && scale.var) root.style.setProperty(scale.var, String(scale.value));
	} catch (e) {
		// Cross-origin embed — the parent posts the picks once we're ready.
	}

	var fail = function (why) {
		if (root.hasAttribute('data-sdocs-stage-ready')) return;
		root.setAttribute('data-sdocs-stage-error', why);
		root.setAttribute('data-sdocs-stage-ready', '');
	};
	window.addEventListener('error', function (e) {
		// A stylesheet or image that 404s doesn't stop the stage from
		// rendering — only a script failure means there'll be nothing to see.
		var t = e.target;
		if (t && t !== window && t.tagName !== 'SCRIPT') return;
		fail('script');
	}, true);
	window.addEventListener('unhandledrejection', function () { fail('script'); });
	// Last resort: something upstream never resolved. Better a marked-failed
	// page than a client waiting out its own timeout with nothing to report.
	setTimeout(function () { fail('timeout'); }, 8000);
})();
`.trim();

/**
 * The capture API, injected into every stage page as `window.__sdocs`.
 *
 * `captureRect` exists because `boundingBox()` returns the border box, and a
 * component's *visible* extent is usually bigger: a shadow, a glow, a focus
 * ring, an outline offset. Cropping to the border box cuts exactly the pixels
 * a design review is looking at. So the rect is grown by the ink each element
 * actually casts, read from computed styles rather than assumed.
 */
export const PREVIEW_RUNTIME_JS = `
(function () {
	var STAGE = 'sdocs-preview';
	var stageEl = function () { return document.getElementById(STAGE); };

	/** Split a CSS list on top-level commas — rgb(0, 0, 0) must stay whole. */
	function splitList(value) {
		var out = [], depth = 0, start = 0;
		for (var i = 0; i < value.length; i++) {
			var c = value[i];
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (c === ',' && depth === 0) { out.push(value.slice(start, i)); start = i + 1; }
		}
		if (start < value.length) out.push(value.slice(start));
		return out.map(function (s) { return s.trim(); }).filter(Boolean);
	}

	function lengths(part) {
		var m = part.match(/-?[\\d.]+px/g);
		return m ? m.map(parseFloat) : [];
	}

	/** How far past its border box one element paints, per side. */
	function inkBleed(el) {
		var cs = getComputedStyle(el);
		var out = { left: 0, right: 0, top: 0, bottom: 0 };
		var grow = function (l, r, t, b) {
			out.left = Math.max(out.left, l); out.right = Math.max(out.right, r);
			out.top = Math.max(out.top, t); out.bottom = Math.max(out.bottom, b);
		};

		var shadow = cs.boxShadow;
		if (shadow && shadow !== 'none') {
			splitList(shadow).forEach(function (part) {
				if (part.indexOf('inset') !== -1) return; // paints inside; never bleeds
				var n = lengths(part);
				var x = n[0] || 0, y = n[1] || 0, blur = n[2] || 0, spread = n[3] || 0;
				var reach = blur + spread;
				grow(Math.max(0, reach - x), Math.max(0, reach + x), Math.max(0, reach - y), Math.max(0, reach + y));
			});
		}

		var filter = cs.filter;
		if (filter && filter !== 'none') {
			splitList(filter).forEach(function (part) {
				var m = /drop-shadow\\(([^)]*)\\)/.exec(part);
				if (!m) return;
				var n = lengths(m[1]);
				var x = n[0] || 0, y = n[1] || 0, blur = n[2] || 0;
				// A drop-shadow's blur is a std deviation: it reaches ~1.5x further.
				var reach = blur * 1.5;
				grow(Math.max(0, reach - x), Math.max(0, reach + x), Math.max(0, reach - y), Math.max(0, reach + y));
			});
		}

		if (cs.outlineStyle && cs.outlineStyle !== 'none') {
			var ring = (parseFloat(cs.outlineWidth) || 0) + Math.max(0, parseFloat(cs.outlineOffset) || 0);
			grow(ring, ring, ring, ring);
		}
		return out;
	}

	/**
	 * A capture rect for one element (default: the whole stage), grown to hold
	 * everything it and its descendants paint. Viewport-relative CSS pixels,
	 * ready to hand to Playwright's page.screenshot({ clip }).
	 */
	function captureRect(selector, options) {
		var el = selector ? document.querySelector(selector) : stageEl();
		if (!el) return null;
		var pad = (options && options.padding) || 0;
		var box = el.getBoundingClientRect();
		var left = box.left, top = box.top, right = box.right, bottom = box.bottom;

		var nodes = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
		nodes.forEach(function (node) {
			var r = node.getBoundingClientRect();
			if (!r.width && !r.height) return;
			var ink = inkBleed(node);
			left = Math.min(left, r.left - ink.left);
			top = Math.min(top, r.top - ink.top);
			right = Math.max(right, r.right + ink.right);
			bottom = Math.max(bottom, r.bottom + ink.bottom);
		});

		left -= pad; top -= pad; right += pad; bottom += pad;

		// Playwright rejects a clip that leaves the page, so clamp — and say so,
		// because a clamped rect means part of the halo is off-screen and the
		// caller should widen the viewport rather than trust the crop.
		var maxW = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
		var maxH = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
		var cl = Math.max(0, Math.floor(left)), ct = Math.max(0, Math.floor(top));
		var cr = Math.min(maxW, Math.ceil(right)), cb = Math.min(maxH, Math.ceil(bottom));
		return {
			x: cl,
			y: ct,
			width: Math.max(1, cr - cl),
			height: Math.max(1, cb - ct),
			clipped: left < 0 || top < 0 || right > maxW || bottom > maxH,
			bleeds: Math.floor(right - left) > Math.ceil(box.width) || Math.floor(bottom - top) > Math.ceil(box.height),
		};
	}

	window.__sdocs = {
		get stage() {
			var r = document.documentElement;
			return {
				id: r.getAttribute('data-sdocs-stage-id'),
				kind: r.getAttribute('data-sdocs-stage-kind'),
				name: r.getAttribute('data-sdocs-stage-name'),
				component: r.getAttribute('data-sdocs-component'),
				error: r.getAttribute('data-sdocs-stage-error'),
			};
		},
		captureRect: captureRect,
		inkBleed: function (selector) {
			var el = selector ? document.querySelector(selector) : stageEl();
			return el ? inkBleed(el) : null;
		},
	};

	/** Ready means photographable: mounted, laid out, webfonts settled, images
	 * decoded. Marking earlier produces screenshots of half-drawn stages. */
	function markReady() {
		var root = document.documentElement;
		if (document.querySelector('.sdocs-stage-error')) root.setAttribute('data-sdocs-stage-error', 'render');
		root.setAttribute('data-sdocs-stage-ready', '');
	}
	var waits = [];
	if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
	waits.push(Promise.all(Array.prototype.slice.call(document.images).map(function (img) {
		return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
	})));
	Promise.all(waits).then(function () {
		requestAnimationFrame(function () { requestAnimationFrame(markReady); });
	}).catch(markReady);
})();
`.trim();

/** Apply `?theme=` / `?css=` / `?axis-<id>=` from the stage URL, so a direct
 * visit can ask for a variant without an Explorer to click in. */
export const PREVIEW_URL_PARAMS_JS = `
(function () {
	var params = new URLSearchParams(location.search);
	var theme = params.get('theme');
	if (theme) {
		// For CSS keyed off an attribute. Media-query themes
		// (prefers-color-scheme) are the browser's to emulate, not ours to fake.
		document.documentElement.setAttribute('data-sdocs-theme', theme);
		document.documentElement.style.colorScheme = theme;
	}
	var css = params.get('css');
	if (css) {
		document.querySelectorAll('link[data-sdocs-stylesheet]').forEach(function (link) {
			link.disabled = link.dataset.sdocsStylesheet !== css;
		});
	}
	// A configured stage in one URL: '?axis-density=compact&axis-palette=olive'.
	// This is what lets an agent photograph one component in one combination
	// without an Explorer to click through. Explicit, so it beats the picks
	// inherited from a parent frame at boot.
	params.forEach(function (value, key) {
		if (key.indexOf('axis-') !== 0) return;
		var id = key.slice(5);
		if (/^[a-z][a-z0-9-]*$/.test(id)) document.documentElement.setAttribute('data-' + id, value);
	});
	// '?scale=1.25&scale-var=--ui-scale' — the property name travels too, since
	// a stage opened on its own has no parent to ask which one the project uses.
	var scaleParam = params.get('scale');
	if (scaleParam && isFinite(Number(scaleParam))) {
		var scaleVar = params.get('scale-var') || '--scale';
		if (/^--[A-Za-z0-9_-]+$/.test(scaleVar)) {
			document.documentElement.style.setProperty(scaleVar, scaleParam);
		}
	}
})();
`.trim();
