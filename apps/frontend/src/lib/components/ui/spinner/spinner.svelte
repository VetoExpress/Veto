<script lang="ts">
  import { t } from '$lib/i18n'
	import { cn } from '$lib/classes/utils.js';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { SVGAttributes } from 'svelte/elements';

	let {
		class: className,
		role = 'status',
		// we add name, color, and stroke for compatibility with different icon libraries props
		name,
		color,
		stroke,
		'aria-label': ariaLabel,
		...restProps
	}: SVGAttributes<SVGSVGElement> = $props();
</script>

<Loader2Icon
	{role}
	name={name === null ? undefined : name}
	color={color === null ? undefined : color}
	stroke={stroke === null ? undefined : stroke}
	aria-label={ariaLabel ?? t('settings_loading')}
	class={cn('size-4 animate-spin', className)}
	{...restProps}
/>
