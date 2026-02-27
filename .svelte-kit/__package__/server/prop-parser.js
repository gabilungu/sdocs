import { readFile } from 'node:fs/promises';
import ts from 'typescript';
/** Parse all component data from a Svelte component file */
export async function parseComponent(filePath) {
    const source = await readFile(filePath, 'utf-8');
    return parseComponentSource(source);
}
/** Parse component data from source */
export function parseComponentSource(source) {
    const scriptContent = extractScriptContent(source);
    const styleContent = extractStyleContent(source);
    let props = [];
    let methods = [];
    let state = [];
    if (scriptContent) {
        const tsAst = ts.createSourceFile('component.ts', scriptContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        const interfaceProps = parseInterfaceProps(tsAst);
        const destructuredProps = parsePropsDestructuring(tsAst);
        const jsdocData = parseJsdocComments(tsAst);
        props = mergeProps(interfaceProps, destructuredProps, jsdocData);
        methods = parseExportedFunctions(tsAst);
        state = parseExportedState(tsAst);
    }
    const cssProps = styleContent ? parseCssProps(source, styleContent) : [];
    return { props, methods, state, cssProps };
}
// ─── Script extraction ───
function extractScriptContent(source) {
    const match = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    return match ? match[1] : null;
}
function extractStyleContent(source) {
    const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    return match ? match[1] : null;
}
function parseInterfaceProps(sourceFile) {
    const props = [];
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === 'Props') {
            for (const member of node.members) {
                if (ts.isPropertySignature(member) && member.name) {
                    const name = member.name.getText(sourceFile);
                    const type = member.type
                        ? member.type.getText(sourceFile)
                        : 'unknown';
                    const optional = !!member.questionToken;
                    const description = getJsdocComment(member, sourceFile);
                    props.push({ name, type, optional, description });
                }
            }
        }
    });
    return props;
}
function parsePropsDestructuring(sourceFile) {
    const props = [];
    function visit(node) {
        // Match: let { ... } = $props()
        if (ts.isVariableDeclaration(node) &&
            node.initializer &&
            ts.isCallExpression(node.initializer) &&
            node.initializer.expression.getText(sourceFile) === '$props' &&
            node.name &&
            ts.isObjectBindingPattern(node.name)) {
            for (const element of node.name.elements) {
                if (ts.isBindingElement(element)) {
                    // Use propertyName when present (e.g. `class: className`)
                    const name = element.propertyName
                        ? element.propertyName.getText(sourceFile)
                        : element.name.getText(sourceFile);
                    const rawDefault = element.initializer
                        ? element.initializer.getText(sourceFile)
                        : null;
                    // Strip wrapping quotes from string literals
                    const defaultValue = rawDefault?.match(/^['"`](.*?)['"`]$/)
                        ? rawDefault.slice(1, -1) || null
                        : rawDefault;
                    props.push({ name, default: defaultValue });
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return props;
}
function parseJsdocComments(sourceFile) {
    // JSDoc data is already captured from interface Props via getJsdocComment
    // This handles per-prop JSDoc in destructuring (JS components)
    const data = [];
    function visit(node) {
        if (ts.isVariableDeclaration(node) &&
            node.name &&
            ts.isObjectBindingPattern(node.name)) {
            for (const element of node.name.elements) {
                if (ts.isBindingElement(element)) {
                    const desc = getJsdocComment(element, sourceFile);
                    if (desc) {
                        data.push({
                            name: element.name.getText(sourceFile),
                            description: desc,
                            type: null,
                        });
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return data;
}
// ─── Merge props from all sources ───
function mergeProps(interfaceProps, destructuredProps, jsdocData) {
    const propMap = new Map();
    // Start with interface props
    for (const ip of interfaceProps) {
        propMap.set(ip.name, {
            name: ip.name,
            type: ip.type,
            default: null,
            description: ip.description,
            required: !ip.optional,
            category: classifyProp(ip.name, ip.type),
        });
    }
    // Merge destructured defaults
    for (const dp of destructuredProps) {
        const existing = propMap.get(dp.name);
        if (existing) {
            existing.default = dp.default;
            if (dp.default !== null)
                existing.required = false;
        }
        else {
            propMap.set(dp.name, {
                name: dp.name,
                type: null,
                default: dp.default,
                description: null,
                required: dp.default === null,
                category: 'prop',
            });
        }
    }
    // Merge JSDoc descriptions
    for (const jd of jsdocData) {
        const existing = propMap.get(jd.name);
        if (existing && !existing.description && jd.description) {
            existing.description = jd.description;
        }
        if (existing && !existing.type && jd.type) {
            existing.type = jd.type;
        }
    }
    return Array.from(propMap.values());
}
// ─── Classify prop ───
function classifyProp(name, type) {
    if (name.startsWith('on') && type?.includes('=>'))
        return 'event';
    if (type?.startsWith('Snippet'))
        return 'snippet';
    return 'prop';
}
// ─── Exported functions ───
function parseExportedFunctions(sourceFile) {
    const methods = [];
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isFunctionDeclaration(node) &&
            node.name &&
            hasExportModifier(node)) {
            const params = node.parameters
                .map((p) => p.getText(sourceFile))
                .join(', ');
            const returnType = node.type
                ? node.type.getText(sourceFile)
                : null;
            const description = getJsdocComment(node, sourceFile);
            methods.push({
                name: node.name.text,
                params,
                returnType,
                description,
            });
        }
    });
    return methods;
}
// ─── Exported state ───
function parseExportedState(sourceFile) {
    const state = [];
    ts.forEachChild(sourceFile, (node) => {
        if (ts.isVariableStatement(node) &&
            hasExportModifier(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name)) {
                    const init = decl.initializer?.getText(sourceFile) ?? '';
                    if (init.includes('$state') ||
                        init.includes('$derived')) {
                        const description = getJsdocComment(node, sourceFile);
                        state.push({
                            name: decl.name.text,
                            type: decl.type
                                ? decl.type.getText(sourceFile)
                                : null,
                            description,
                        });
                    }
                }
            }
        }
    });
    return state;
}
// ─── CSS custom properties ───
function parseCssProps(fullSource, styleContent) {
    const propMap = new Map();
    // Extract var(--name) and var(--name, default) from <style>
    // Supports one level of nested parens: var(--x, var(--y)), var(--x, rgba(0,0,0,0.5))
    const varRegex = /var\(\s*(--[\w-]+)(?:\s*,\s*((?:[^()]+|\([^)]*\))+))?\s*\)/g;
    let match;
    while ((match = varRegex.exec(styleContent)) !== null) {
        const name = match[1];
        const defaultVal = match[2]?.trim() ?? null;
        propMap.set(name, {
            name,
            type: null,
            default: defaultVal,
            description: null,
        });
    }
    // Extract @cssvar JSDoc annotations from <script>
    const cssvarRegex = /@cssvar\s+\{(\w+)\}\s+(--[\w-]+)\s*-?\s*(.*?)(?:\(default:\s*([^)]+)\))?$/gm;
    while ((match = cssvarRegex.exec(fullSource)) !== null) {
        const type = match[1];
        const name = match[2];
        const description = match[3]?.trim() || null;
        const defaultVal = match[4]?.trim() ?? null;
        const existing = propMap.get(name);
        if (existing) {
            existing.type = type;
            if (description)
                existing.description = description;
            if (defaultVal && !existing.default)
                existing.default = defaultVal;
        }
        else {
            propMap.set(name, { name, type, default: defaultVal, description });
        }
    }
    return Array.from(propMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
// ─── Helpers ───
function getJsdocComment(node, sourceFile) {
    const fullText = sourceFile.getFullText();
    const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    if (!ranges)
        return null;
    for (const range of ranges) {
        const comment = fullText.slice(range.pos, range.end);
        if (comment.startsWith('/**')) {
            // Extract text between /** and */
            const text = comment
                .replace(/^\/\*\*\s*/, '')
                .replace(/\s*\*\/$/, '')
                .replace(/^\s*\*\s?/gm, '')
                .trim();
            // Skip @tags
            const firstLine = text.split('\n')[0];
            if (firstLine && !firstLine.startsWith('@')) {
                return firstLine;
            }
        }
    }
    return null;
}
function hasExportModifier(node) {
    const modifiers = ts.canHaveModifiers(node)
        ? ts.getModifiers(node)
        : undefined;
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
