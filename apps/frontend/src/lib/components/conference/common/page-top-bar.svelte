<script lang="ts">
  import { t } from '$lib/i18n'
  import { ArrowLeft } from '@lucide/svelte'
  import type { LucideIcon } from '@lucide/svelte'
  import type { Snippet } from 'svelte'
  import { Button } from '$lib/components/ui/button'
  import { cn } from '$lib/classes/utils'

  interface Props {
    icon?: LucideIcon
    title: string
    subtitle?: string
    backHref: string
    backLabel?: string
    iconClass?: string
    class?: string
    showBackButton?: boolean
    actions?: Snippet
  }

  let {
    icon: Icon,
    title,
    subtitle,
    backHref,
    backLabel,
    iconClass = '',
    class: className,
    showBackButton = true,
    actions
  }: Props = $props()
</script>

<div class={cn('flex shrink-0 items-center gap-4 border-b px-6 py-3', className)}>
  {#if showBackButton}
    <Button variant="ghost" size="sm" class="gap-1.5 text-xs" href={backHref}>
      <ArrowLeft size={14} />
      {backLabel ?? t('procedure_back_to_conference')}
    </Button>
    <div class="h-4 w-px bg-border"></div>
  {/if}

  {#if Icon}
    <div class="flex items-center gap-2">
      <Icon size={16} class={cn('text-indigo-500', iconClass)} />
      <span class="text-sm font-semibold text-foreground">{title}</span>
    </div>
  {:else}
    <span class="text-sm font-semibold text-foreground">{title}</span>
  {/if}

  {#if subtitle}
    <span class="text-xs text-muted-foreground">{subtitle}</span>
  {/if}

  {#if actions}
    <div class="ml-auto flex items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
