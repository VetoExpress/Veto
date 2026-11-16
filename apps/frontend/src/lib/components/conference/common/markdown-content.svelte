<script lang="ts">
  import SvelteMarkdown from '@humanspeak/svelte-markdown'
  import { cn } from '$lib/classes/utils.js'

  interface Props {
    source: string
    class?: string
  }

  let { source, class: className }: Props = $props()
</script>

<article class={cn('markdown-content text-sm leading-7', className)}>
  <SvelteMarkdown {source} />
</article>

<style>
  .markdown-content {
    overflow-wrap: anywhere;
  }
  .markdown-content :global(p) {
    margin-block: 0.5rem;
  }
  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin-block: 0.5rem;
    padding-left: 1.5rem;
  }
  .markdown-content :global(ul) {
    list-style: disc;
  }
  .markdown-content :global(ol) {
    list-style: decimal;
  }
  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3) {
    margin-block: 1rem 0.5rem;
    font-weight: 650;
  }
  .markdown-content :global(img) {
    max-width: 100%;
  }
  .markdown-content :global(pre) {
    overflow-x: auto;
  }
  .markdown-content :global(code) {
    border-radius: 0.25rem;
    background: var(--muted);
    padding: 0.1rem 0.3rem;
  }
</style>
