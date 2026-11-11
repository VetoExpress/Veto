<script lang="ts">
  import { t } from '$lib/i18n'
	import { Button } from '$lib/components/ui/button';
	import { Pin, PinOff } from '@lucide/svelte';
	import { rightBarPinned } from '$lib/classes/stores/battle/battle-ui-store';

	function togglePin() {
		rightBarPinned.update((prev) => !prev);
	}
</script>

<Button variant="ghost" size="icon" onclick={togglePin} title={t('components_toggle_pin')}>
	{#if $rightBarPinned}
		<Pin />
	{:else}
		<PinOff />
	{/if}
</Button>
