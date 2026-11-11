<script lang="ts">
  import { t } from '$lib/i18n'
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { page } from '$app/stores'
  import { Home, RefreshCw } from '@lucide/svelte'

  const status = $derived($page.status ?? 500)
  const message = $derived($page.error?.message ?? 'An unexpected error occurred')
  const catUrl = $derived(`https://http.cat/${status}`)
</script>

<div
  class="flex min-h-screen w-screen flex-col items-center justify-center gap-6 overflow-auto bg-gradient-to-br from-slate-100 to-stone-200 px-6 py-10 sm:gap-8 sm:py-12 dark:from-slate-900 dark:to-stone-950"
>
  <!-- HTTP Cat 图片 -->
  <div
    class="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-stone-200 dark:ring-stone-700"
  >
    <img
      src={catUrl}
      alt="HTTP {status} — {message}"
      class="block h-48 w-auto object-cover sm:h-80"
      onerror={(e) => {
        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
      }}
    />
  </div>

  <!-- 错误信息 -->
  <div class="flex flex-col items-center gap-3 text-center">
    <span
      class="rounded-full bg-stone-200 px-4 py-1 text-xs font-semibold tracking-widest text-stone-500 dark:bg-stone-800 dark:text-stone-400"
    >
      HTTP {status}
    </span>
    <h1 class="text-2xl font-bold text-stone-800 sm:text-3xl dark:text-stone-100">
      {message}
    </h1>
    <p class="max-w-xs text-sm text-stone-400 sm:max-w-sm dark:text-stone-500">
      {t('procedure_something_went_wrong_try_refreshing_the_page_or_return_home')}
    </p>
  </div>

  <!-- 操作按钮 -->
  <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
    <button
      onclick={() => goto(resolve('/'))}
      class="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-800 px-5 py-3 text-sm font-medium text-white shadow transition hover:bg-stone-700 active:scale-95 sm:w-auto sm:py-2.5 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
    >
      <Home class="size-4" />
      {t('procedure_return_home')}
    </button>
    <button
      onclick={() => location.reload()}
      class="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white/60 px-5 py-3 text-sm font-medium text-stone-700 shadow backdrop-blur-sm transition hover:bg-white active:scale-95 sm:w-auto sm:py-2.5 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
    >
      <RefreshCw class="size-4" />
      {t('procedure_refresh_page')}
    </button>
  </div>
</div>
