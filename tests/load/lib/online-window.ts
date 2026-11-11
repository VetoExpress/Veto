/** Each VU must cover the SAME absolute interval. Summed connection starts cannot prove overlap. */
export class OnlineWindow {
  private online = false
  private changedAt = Number.NEGATIVE_INFINITY
  private failed = false

  constructor(
    readonly start: number,
    readonly end: number
  ) {
    if (!(end > start)) throw new Error('INVALID_ONLINE_WINDOW')
  }

  update(online: boolean, now: number): void {
    // Any offline interval intersecting [start, end) permanently invalidates this seat.
    if (!this.online && now > this.start && this.changedAt < this.end) this.failed = true
    if (!online && now >= this.start && now < this.end) this.failed = true
    this.online = online
    this.changedAt = now
  }

  complete(now: number): boolean {
    this.update(this.online, now)
    return now >= this.end && !this.failed
  }
}
