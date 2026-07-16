import { copyFileSync } from 'node:fs';

// The authoring guide is single-sourced in the sdocs package (it also backs
// the MCP server's get_authoring_guide tool); the site serves a copy at
// /llms.txt. Runs as predev/prebuild, so the copy can't go stale.
copyFileSync(
	new URL('../../../packages/sdocs/llms.txt', import.meta.url),
	new URL('../static/llms.txt', import.meta.url),
);
console.log('[docs] synced llms.txt from packages/sdocs');
