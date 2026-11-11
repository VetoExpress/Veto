<script lang="ts">
  import { t } from '$lib/i18n'
  import { ChevronsUpDown, Grip, House, LayoutGrid } from '@lucide/svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import favicon from '$lib/assets/favicon.png'
  import { VETO_NAME } from '$lib/classes/const'
  import { isElectron } from '$lib/classes/utils/runtime'
  import {
    currentCommittee,
    currentConferenceRecord
  } from '$lib/classes/stores/conference/conference-store'

  let {
    conferenceName,
    committeeName
  }: {
    hasConf?: boolean
    confPrefix?: string
    conferenceName?: string
    committeeName?: string
  } = $props()

  const conference = $derived(conferenceName ?? $currentConferenceRecord?.name)
  const committee = $derived(committeeName ?? $currentCommittee?.name)

  let title = $derived(committee ?? conference ?? VETO_NAME)
  let subTitle = $derived(committee && conference ? conference : t('settings_conference_system'))
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            {...props}
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div
              class="flex aspect-square size-8 items-center justify-center rounded-lg text-sidebar-primary-foreground"
            >
              <img src={favicon} alt={VETO_NAME} class="size-8" />
            </div>
            <div class="grid flex-1 text-start text-sm leading-tight">
              <span class="truncate font-medium">{title}</span>
              <span class="truncate text-xs">{subTitle}</span>
            </div>
            <ChevronsUpDown size={16} class="ms-auto" />
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenu.Label class="text-xs text-muted-foreground">{t('settings_navigation')}</DropdownMenu.Label>
        <DropdownMenu.Item onclick={() => goto(resolve('/'))} class="gap-2 p-2">
          <House size={16} />
          {t('settings_home')}
        </DropdownMenu.Item>
        {#if !isElectron()}
          <DropdownMenu.Item
            onclick={() => window.location.replace('https://veto.miaoyww.top')}
            class="gap-2 p-2"
          >
            <Grip size={16} />
            {t('settings_official_site')}
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item
          onclick={() => window.location.replace('https://platform.miaoyww.top/?from=app')}
          class="gap-2 p-2"
        >
          <LayoutGrid size={16} />
          {t('settings_cloud_platform')}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
