export type LiveTopic = 'files' | 'notifications' | 'news' | 'directives' | 'situations' | 'timeline'

type Subscription = {
  topics: Set<LiveTopic>
  refresh: () => void | Promise<void>
  dirty: boolean
  running: boolean
  active: boolean
  timer?: ReturnType<typeof setTimeout>
}

/** Coalesce bursts, serialize reads, and defer background-window requests. */
export class LiveRefresh {
  private subscriptions = new Set<Subscription>()
  private visible = true

  subscribe(topics: LiveTopic[], refresh: () => void | Promise<void>): () => void {
    const subscription: Subscription = {
      topics: new Set(topics), refresh, dirty: false, running: false, active: true
    }
    this.subscriptions.add(subscription)
    return () => {
      subscription.active = false
      clearTimeout(subscription.timer)
      this.subscriptions.delete(subscription)
    }
  }

  invalidate(topics?: LiveTopic[]): void {
    for (const subscription of this.subscriptions) {
      if (topics && !topics.some((topic) => subscription.topics.has(topic))) continue
      subscription.dirty = true
      this.schedule(subscription)
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible) for (const subscription of this.subscriptions) this.schedule(subscription)
  }

  private schedule(subscription: Subscription): void {
    if (!this.visible || !subscription.active || !subscription.dirty || subscription.running || subscription.timer) return
    subscription.timer = setTimeout(async () => {
      subscription.timer = undefined
      if (!this.visible || !subscription.active) return
      subscription.dirty = false
      subscription.running = true
      try { await subscription.refresh() }
      catch { /* A later notification or reconciliation retries failed reads. */ }
      finally {
        subscription.running = false
        this.schedule(subscription)
      }
    }, 250)
  }
}
