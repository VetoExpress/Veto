<script lang="ts">
  import { t } from '$lib/i18n'
	import type { Command as CommandPrimitive, Dialog as DialogPrimitive } from "bits-ui";
	import type { Snippet } from "svelte";
	import Command from "./command.svelte";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import type { WithoutChildrenOrChild } from "$lib/classes/utils.js";

	let {
		open = $bindable(false),
		ref = $bindable(null),
		value = $bindable(""),
		title,
		description,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.RootProps> &
		WithoutChildrenOrChild<CommandPrimitive.RootProps> & {
			portalProps?: DialogPrimitive.PortalProps;
			children: Snippet;
			title?: string;
			description?: string;
		} = $props();
</script>

<Dialog.Root bind:open {...restProps}>
	<Dialog.Header class="sr-only">
		<Dialog.Title>{title ?? t('settings_command_palette')}</Dialog.Title>
		<Dialog.Description>{description ?? t('settings_command_search')}</Dialog.Description>
	</Dialog.Header>
	<Dialog.Content class="overflow-hidden p-0" {portalProps}>
		<Command
			class="**:data-[slot=command-input-wrapper]:h-12 [&_[data-command-group]:not([hidden])_~[data-command-group]]:pt-0 [&_[data-command-group]]:px-2 [&_[data-command-input-wrapper]_svg]:h-5 [&_[data-command-input-wrapper]_svg]:w-5 [&_[data-command-input]]:h-12 [&_[data-command-item]]:px-2 [&_[data-command-item]]:py-3 [&_[data-command-item]_svg]:h-5 [&_[data-command-item]_svg]:w-5"
			{...restProps}
			bind:value
			bind:ref
			{children}
		/>
	</Dialog.Content>
</Dialog.Root>
