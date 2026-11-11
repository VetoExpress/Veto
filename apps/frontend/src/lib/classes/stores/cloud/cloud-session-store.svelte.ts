import {
  getCloudChairCommittee,
  saveCloudSeatSession,
  getCloudSeatSession,
  CloudJoinError,
  type CloudChairCommittee,
  type CloudClaimResult,
  type CloudSeatSession
} from '$lib/classes/clients/cloud-join-client'
import type { Capability } from '$lib/classes/types/delegate'
import { t } from '$lib/i18n'
import { applyCloudChairProjection } from '$lib/classes/stores/conference/cloud-membership-store'

class CloudSessionStore {
  session = $state<CloudSeatSession | null>(getCloudSeatSession())
  chairProjection = $state<CloudChairCommittee | null>(null)
  chairError = $state('')
  loadingChairProjection = $state(false)

  private chairRequestKey = ''
  private chairRequestSequence = 0

  capabilities = $derived<string[]>(this.session?.result.identity.capabilities ?? [])

  hasCapability(...capabilityTypes: Capability[]): boolean {
    return capabilityTypes.some((capability) => this.capabilities.includes(capability))
  }

  setResult(result: CloudClaimResult): void {
    this.session = { result, connectedAt: Date.now() }
    this.chairProjection = null
    this.chairError = ''
    this.chairRequestKey = ''
    saveCloudSeatSession(result)
  }

  clear(): void {
    this.session = null
    this.chairProjection = null
    this.chairError = ''
    this.loadingChairProjection = false
    this.chairRequestKey = ''
    this.chairRequestSequence = 0
  }

  async ensureChairProjection(conferenceId: string, committeeId: string): Promise<void> {
    const session = this.session
    const identity = session?.result.identity
    const matchesRoute =
      session &&
      identity &&
      session.result.conferenceId === conferenceId &&
      identity.committeeId === committeeId

    // Chair identity is derived solely from control_conference. The service returns
    // the authorized Committee projection for that Seat; there is no assignment record.
    if (!matchesRoute || !session || !identity || !this.hasCapability('control_conference')) {
      if (this.chairRequestKey) {
        this.chairRequestKey = ''
        this.chairProjection = null
        this.chairError = ''
      }

      return
    }
    const requestKey = `${conferenceId}:${committeeId}`
    if (
      requestKey === this.chairRequestKey &&
      (this.chairProjection || this.loadingChairProjection)
    ) {
      return
    }
    this.chairRequestKey = requestKey
    this.chairError = ''
    this.loadingChairProjection = true
    const requestSequence = ++this.chairRequestSequence
    try {
      const projection = await getCloudChairCommittee(session.result.token)
      if (requestSequence !== this.chairRequestSequence) return
      applyCloudChairProjection(projection)
      this.chairProjection = projection
    } catch (error) {
      if (requestSequence !== this.chairRequestSequence) return
      this.chairProjection = null
      this.chairError =
        error instanceof CloudJoinError ? error.message : t('services_chair_retry')
    } finally {
      if (requestSequence === this.chairRequestSequence) {
        this.loadingChairProjection = false
      }
    }
  }
}

export const cloudSession = new CloudSessionStore()
