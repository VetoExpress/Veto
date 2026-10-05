<script lang="ts">
  import { Building2, CalendarDays, ExternalLink, Users } from '@lucide/svelte'
  import type { PlatformConference } from '$lib/classes/clients/account-conference-client'
  import { openPlatformConference } from '$lib/classes/stores/conference/platform-conference-store'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  let { conference }: { conference: PlatformConference } = $props()
</script>

<Card.Root
  class="w-full max-w-xl cursor-pointer gap-0 bg-card/70 py-0 transition-colors hover:border-primary/50"
  role="link"
  tabindex={0}
  onclick={() => openPlatformConference(conference)}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPlatformConference(conference)
    }
  }}
>
  <Card.Content class="flex flex-col gap-3 p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <h3 class="truncate font-semibold">{conference.name}</h3>
        <Badge variant="secondary">云平台</Badge>
        <Badge variant="outline">{({ draft: '草稿', active: '进行中', closed: '已结束' })[conference.lifecycle]}</Badge>
      </div>
      <Button size="sm" variant="outline" class="shrink-0" onclick={(event) => { event.stopPropagation(); openPlatformConference(conference) }}>打开云平台<ExternalLink data-icon="inline-end" /></Button>
    </div>
    {#if conference.organizer}<p class="text-sm text-muted-foreground">{conference.organizer}</p>{/if}
    {#if conference.description}<p class="text-sm text-muted-foreground">{conference.description}</p>{/if}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span class="flex items-center gap-1"><Building2 class="size-3" />{conference.committeeCount !== undefined ? `${conference.committeeCount} 个会场` : '会场数暂不可用'}</span>
        <span class="flex items-center gap-1.5"><CalendarDays class="size-3" />{new Date(conference.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <span class="flex items-center gap-1"><Users class="size-3" />{conference.seatCount !== undefined ? `${conference.seatCount} 个席位` : '席位数暂不可用'}</span>
    </div>
  </Card.Content>
</Card.Root>
