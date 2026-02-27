import { glob } from 'tinyglobby';
import { resolve } from 'node:path';
/** Discover all .sdoc files matching the include patterns */
export async function discoverDocFiles(include, root) {
    const files = await glob(include, {
        cwd: root,
        absolute: true,
    });
    return files.sort();
}
/** Determine the sdoc kind from the file path */
export function getSdocKind(filePath) {
    const name = filePath.split('/').pop() ?? '';
    if (name.includes('.page.'))
        return 'page';
    if (name.includes('.layout.'))
        return 'layout';
    return 'component';
}
/** Get the absolute path for a relative import */
export function resolveImportPath(importPath, fromFile) {
    const dir = fromFile.substring(0, fromFile.lastIndexOf('/'));
    return resolve(dir, importPath);
}
