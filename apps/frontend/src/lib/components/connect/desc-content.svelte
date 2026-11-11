<script lang="ts">
  import { t } from '$lib/i18n'
  import TextAnimate from '$lib/components/ui/text-animate.svelte'
  import TypingAnimation from '$lib/components/ui/typing-animation.svelte'

  let heroStage = $state(0)
</script>

<section class="hidden flex-1 flex-col justify-center px-12 lg:flex xl:px-24">
  <div class="max-w-xl">
    <h1 class="text-5xl font-bold tracking-tight text-foreground">
      <TypingAnimation
        text="Build your ideas."
        as="span"
        startOnView={false}
        onComplete={() => (heroStage = 1)}
      />
      <br />

      {#if heroStage >= 1}
        <TypingAnimation
          text=" Better than ever. "
          as="span"
          className="text-primary"
          startOnView={false}
          onComplete={() => (heroStage = 2)}
        />
      {/if}
    </h1>

    {#if heroStage >= 2}
      <TextAnimate
        text={t('components_connect_description')}
        as="p"
        className="mt-6 max-w-md text-lg text-muted-foreground"
        startOnView={false}
        onComplete={() => (heroStage = 3)}
      />
    {/if}

    {#if heroStage >= 3}
      <div class="mt-10 flex gap-6 text-sm text-muted-foreground">
        <div>
          <TextAnimate
            text={t('components_one_stop')}
            as="div"
            animation="blurInUp"
            className="text-2xl font-bold text-foreground"
            startOnView={false}
          />
          <TextAnimate text={t('components_conference_management')} as="div" delay={150} startOnView={false} />
        </div>

        <div>
          <TextAnimate
            text={t('components_realtime')}
            as="div"
            delay={150}
            animation="blurInUp"
            className="text-2xl font-bold text-foreground"
            startOnView={false}
          />
          <TextAnimate text={t('components_situation_sync')} as="div" delay={300} startOnView={false} />
        </div>

        <div>
          <TextAnimate
            text={t('components_end_to_end')}
            as="div"
            delay={300}
            animation="blurInUp"
            className="text-2xl font-bold text-foreground"
            startOnView={false}
          />
          <TextAnimate text={t('components_digital_management')} as="div" delay={450} startOnView={false} />
        </div>
      </div>
    {/if}
  </div>
</section>
