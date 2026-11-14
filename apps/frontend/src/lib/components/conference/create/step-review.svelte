<script lang="ts">
  import { t } from '$lib/i18n'
  import { wizard } from '$lib/classes/stores/runes/create-conference-event-wizard.svelte'
  import MeetingCard from './meeting-card.svelte'
</script>

<section class="flex flex-col gap-5">
  <article class="rounded-lg border p-4">
    <h2 class="truncate text-sm font-semibold">{wizard.eventName || t('procedure_untitled_conference')}</h2>
    <dl
      class={wizard.mode === 'singleton'
        ? 'mt-3 grid gap-3 text-sm sm:grid-cols-3'
        : 'mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4'}
    >
      <div>
        <dt class="text-xs text-muted-foreground">{t('procedure_creation_mode')}</dt>
        <dd class="mt-1 font-medium">
          {wizard.mode === 'singleton' ? t('procedure_singleton_mode') : t('procedure_conference_mode')}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">
          {wizard.mode === 'singleton' ? t('procedure_meeting') : t('procedure_committee')}
        </dt>
        <dd class="mt-1 font-medium">
          {wizard.mode === 'singleton'
            ? wizard.committees[0]?.name || t('procedure_untitled_meeting')
            : wizard.committees.length}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted-foreground">{t('procedure_seat')}</dt>
        <dd class="mt-1 font-medium">{wizard.totalSeatCount}</dd>
      </div>
    </dl>
  </article>

  <div class="grid gap-4">
    {#each wizard.committees as committee (committee.id)}
      <MeetingCard {committee} isSingleton={wizard.mode === 'singleton'} />
    {/each}
  </div>

  {#if wizard.createError}
    <p class="text-sm text-destructive" role="alert">{wizard.createError}</p>
  {/if}
</section>
