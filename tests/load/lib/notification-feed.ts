/** Serialize notification pagination across initial refreshes and live invalidations. */
export class NotificationFeed {
  private cursor = 0
  private pending: Promise<void> | undefined
  constructor(
    private readonly read: (cursor: number) => Promise<Record<string, unknown>>,
    private readonly active: () => boolean
  ) {}

  sync(): Promise<void> {
    if (this.pending) return this.pending
    this.pending = this.pages().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  private async pages(): Promise<void> {
    for (let page = 0; page < 10 && this.active(); page++) {
      const result = await this.read(this.cursor)
      if (!Array.isArray(result.notifications) || !Number.isSafeInteger(result.nextCursor)) {
        throw new Error('invalid_notifications')
      }
      const next = result.nextCursor as number
      if (next < this.cursor || (result.notifications.length > 0 && next === this.cursor)) {
        throw new Error('cursor_not_advancing')
      }
      this.cursor = next
      if (result.notifications.length < 200) break
    }
  }
}
