import { describe, expect, it } from 'vitest';
import {
	argsObjectLiteral,
	formatAttr,
	generateFallbackCode,
	patchSnippetCode,
	resolveArgsInCode,
} from '../../src/lib/explorer/views/usage-code.js';

describe('formatAttr / argsObjectLiteral — empty string is a real value', () => {
	it('renders an empty string as name=""', () => {
		expect(formatAttr('label', '')).toBe('label=""');
	});

	it('keeps empty strings in the args literal, drops unset', () => {
		expect(argsObjectLiteral({ a: '', b: undefined, c: 1 })).toBe('{ a: "", c: 1 }');
	});
});

describe('generateFallbackCode', () => {
	it('skips unset props, keeps empty strings', () => {
		expect(generateFallbackCode('X', { a: undefined, b: '' }, {})).toBe('<X b="" />');
	});

	it('renders bare when nothing is set', () => {
		expect(generateFallbackCode('X', {}, {})).toBe('<X />');
	});
});

describe('patchSnippetCode — unset removes the attribute', () => {
	it('removes an attribute for a prop unset since the initial args', () => {
		const out = patchSnippetCode('<Button text="Login" />', 'Button', {}, {}, { text: 'Login' }, {});
		expect(out).toBe('<Button />');
	});

	it('removes and updates in the same pass', () => {
		const out = patchSnippetCode(
			'<Button text="Login" size="md" />',
			'Button',
			{ size: 'lg' },
			{},
			{ text: 'Login', size: 'md' },
			{},
		);
		expect(out).toBe('<Button size="lg" />');
	});

	it('removes an expression attribute', () => {
		const out = patchSnippetCode('<Button count={3} />', 'Button', {}, {}, { count: 3 }, {});
		expect(out).toBe('<Button />');
	});

	it('writes an explicit empty string', () => {
		const out = patchSnippetCode(
			'<Button text="Login" />',
			'Button',
			{ text: '' },
			{},
			{ text: 'Login' },
			{},
		);
		expect(out).toBe('<Button text="" />');
	});

	it('returns the body untouched when nothing changed', () => {
		const body = '<Button text="Login" />';
		expect(patchSnippetCode(body, 'Button', { text: 'Login' }, {}, { text: 'Login' }, {})).toBe(body);
	});
});

describe('resolveArgsInCode', () => {
	it('expands a plain spread with the set values, keeping empty strings', () => {
		const out = resolveArgsInCode('<X {...args} />', { a: '', b: undefined });
		expect(out).toBe('<X a="" />');
	});

	it('declares a const args line when args is used beyond the spread', () => {
		const out = resolveArgsInCode('<X label={args.label} />', { label: 'hi' });
		expect(out).toContain('const args = { label: "hi" };');
	});
});
