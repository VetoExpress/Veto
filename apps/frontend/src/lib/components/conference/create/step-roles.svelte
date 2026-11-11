<script lang="ts">
  import { t } from '$lib/i18n'
  import { Plus } from '@lucide/svelte'
  import * as Field from '$lib/components/ui/field'
  import { Button } from '$lib/components/ui/button'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import RoleCard from './role-card.svelte'

  const showNoRoles = $derived(wizard.attempted && wizard.roles.length === 0)
</script>

<section class="flex flex-col gap-4">
  {#if showNoRoles}
    <Field.FieldError>{t('procedure_add_at_least_one_role')}</Field.FieldError>
  {/if}

  {#each wizard.roles as role (role.id)}
    <RoleCard {role} />
  {/each}

  <Button variant="outline" class="w-fit" onclick={() => wizard.addRole()}>
    <Plus data-icon="inline-start" />
    {t('procedure_add_role')}
  </Button>
</section>
