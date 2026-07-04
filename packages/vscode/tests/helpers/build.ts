/** Global setup: the suites test the BUNDLED server, so build it first. */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export default function setup() {
	execFileSync('node', ['esbuild.js'], {
		cwd: resolve(__dirname, '../..'),
		stdio: 'inherit',
	});
}
