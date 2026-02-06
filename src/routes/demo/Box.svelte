<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A demo box component (TypeScript version).
	 *
	 * @cssvar {color} --bg - Background color (default: var(--base-100))
	 */
	interface Props {
		children?: Snippet;
		var1?: boolean;
		var2?: string;
		var3?: number;
		var4?: bigint;
		var5?: symbol;
		var6?: null;
		var7?: undefined;
		var8?: object;
		var9?: () => void;
	}

	let {
		children,
		var1 = true,
		var2 = 'text',
		var3 = 42,
		var4 = 0n,
		var5 = Symbol('demo'),
		var6 = null,
		var7 = undefined,
		var8 = { key: 'value' },
		var9 = () => {}
	}: Props = $props();
</script>

<div class="Box">
	<div class="title">Primitives</div>
	<div class="header">
		<div class="col-name">name</div>
		<div class="col-typeof">typeof()</div>
		<div class="col-type">type</div>
		<div class="col-value">value</div>
	</div>
	<div class="row">
		<div class="col-name">var1</div>
		<div class="col-typeof">{typeof var1}</div>
		<div class="col-type">boolean</div>
		<div class="col-value">{var1}</div>
	</div>
	<div class="row">
		<div class="col-name">var2</div>
		<div class="col-typeof">{typeof var2}</div>
		<div class="col-type">string</div>
		<div class="col-value">{var2}</div>
	</div>
	<div class="row">
		<div class="col-name">var3</div>
		<div class="col-typeof">{typeof var3}</div>
		<div class="col-type">number</div>
		<div class="col-value">{var3}</div>
	</div>
	<div class="row">
		<div class="col-name">var4</div>
		<div class="col-typeof">{typeof var4}</div>
		<div class="col-type">bigint</div>
		<div class="col-value">{var4}</div>
	</div>
	<div class="row">
		<div class="col-name">var5</div>
		<div class="col-typeof">{typeof var5}</div>
		<div class="col-type">symbol</div>
		<div class="col-value">{var5.toString()}</div>
	</div>
	<div class="row">
		<div class="col-name">var6</div>
		<div class="col-typeof">{typeof var6}</div>
		<div class="col-type">null</div>
		<div class="col-value">{var6}</div>
	</div>
	<div class="row">
		<div class="col-name">var7</div>
		<div class="col-typeof">{typeof var7}</div>
		<div class="col-type">undefined</div>
		<div class="col-value">{var7}</div>
	</div>
	<div class="row">
		<div class="col-name">var8</div>
		<div class="col-typeof">{typeof var8}</div>
		<div class="col-type">object</div>
		<div class="col-value">{JSON.stringify(var8)}</div>
	</div>
	<div class="row">
		<div class="col-name">var9</div>
		<div class="col-typeof">{typeof var9}</div>
		<div class="col-type">() => void</div>
		<div class="col-value">fn()</div>
	</div>
	<div class="row">
		<div class="col-name">children</div>
		<div class="col-typeof">{typeof children}</div>
		<div class="col-type">Snippet</div>
		<div class="col-value">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
</div>

<style>
	.Box {
		background: var(--bg, var(--base-100));
		border-radius: 4px;
		padding: 12px 16px;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title {
		font-size: 14px;
		font-weight: 700;
		margin-bottom: 8px;
	}
	.header {
		display: flex;
		flex-direction: row;
		gap: 16px;
		font-size: 11px;
		font-weight: 600;
		color: var(--base-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--base-200);
		margin-bottom: 2px;
	}
	.row {
		font-size: 13px;
		display: flex;
		flex-direction: row;
		gap: 16px;
		padding: 2px 0;
	}
	.col-name {
		width: 70px;
		font-weight: bold;
	}
	.col-typeof {
		width: 70px;
		color: var(--base-400);
	}
	.col-type {
		width: 80px;
		color: var(--base-500);
		font-family: var(--font-mono);
	}
	.col-value {
		flex: 1;
	}
</style>
