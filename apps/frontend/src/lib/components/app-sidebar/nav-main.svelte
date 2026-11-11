<script lang="ts">
  import { t } from '$lib/i18n'
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'
  import * as Collapsible from '$lib/components/ui/collapsible/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'

  let {
    groups
  }: {
    groups: {
      label: string
      items: {
        title: string
        url: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        icon: any
        isActive?: boolean
        items?: {
          title: string
          url: string
        }[]
      }[]
    }[]
  } = $props()
</script>

{#each groups as group, groupIndex (groupIndex)}
  <Sidebar.Group>
    <Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
    <Sidebar.Menu>
      {#each group.items as mainItem (mainItem.url)}
        <Collapsible.Root open={mainItem.isActive}>
          {#snippet child({ props })}
            <Sidebar.MenuItem {...props}>
              <Sidebar.MenuButton tooltipContent={mainItem.title}>
                {#snippet child({ props })}
                  <a href={mainItem.url} {...props}>
                    <mainItem.icon />
                    <span>{mainItem.title}</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
              {#if mainItem.items?.length}
                <Collapsible.Trigger>
                  {#snippet child({ props })}
                    <Sidebar.MenuAction {...props} class="data-[state=open]:rotate-90">
                      <ChevronRightIcon />
                      <span class="sr-only">{t('settings_toggle')}</span>
                    </Sidebar.MenuAction>
                  {/snippet}
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <Sidebar.MenuSub>
                    {#each mainItem.items as subItem (subItem.url)}
                      <Sidebar.MenuSubItem>
                        <Sidebar.MenuSubButton href={subItem.url}>
                          <span>{subItem.title}</span>
                        </Sidebar.MenuSubButton>
                      </Sidebar.MenuSubItem>
                    {/each}
                  </Sidebar.MenuSub>
                </Collapsible.Content>
              {/if}
            </Sidebar.MenuItem>
          {/snippet}
        </Collapsible.Root>
      {/each}
    </Sidebar.Menu>
  </Sidebar.Group>
{/each}
