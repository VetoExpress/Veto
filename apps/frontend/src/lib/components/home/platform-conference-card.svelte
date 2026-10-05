<script lang="ts">
  import { ExternalLink } from '@lucide/svelte'
  import type { PlatformConference } from '$lib/classes/clients/account-conference-client'
  import { openPlatformConference } from '$lib/classes/stores/conference/platform-conference-store'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import * as Card from '$lib/components/ui/card'
  let { conference }: { conference: PlatformConference } = $props()
</script>

<Card.Root
  class="cursor-pointer bg-card/70 transition-colors hover:border-primary/50"
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
  <Card.Content class="flex items-center justify-between gap-4 p-5">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="truncate font-semibold">{conference.name}</h3>
        <Badge variant="secondary">云平台</Badge>
        <Badge variant="outline">{({ draft: '草稿', active: '进行中', closed: '已结束' })[conference.lifecycle]}</Badge>
      </div>
      {#if conference.organizer}<p class="mt-2 text-sm text-muted-foreground">{conference.organizer}</p>{/if}
      {#if conference.description}<p class="mt-1 text-sm text-muted-foreground">{conference.description}</p>{/if}
    </div>
    <Button variant="outline" onclick={(event) => { event.stopPropagation(); openPlatformConference(conference) }}>打开云平台<ExternalLink data-icon="inline-end" /></Button>
  </Card.Content>
</Card.Root>
