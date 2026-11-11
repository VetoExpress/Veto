import { get, writable } from 'svelte/store'
import { t } from '$lib/i18n'
import type { Committee as CommitteeData } from '$lib/classes/types/committee'
import type { Seat } from '$lib/classes/types/delegate'
import { Committee } from '$lib/classes/domain/committee.svelte'
import { bootstrapStore, saveToStore } from '$lib/classes/helpers/store-bridge'

export interface CommitteeCheckpoint {
  id: string
  conferenceId: string
  committeeId: string
  createdAt: number
  label: string
  data: Omit<CommitteeData, 'seats'>
  procedures: { id: string; procedure: Seat['procedure'] }[]
}
export const committeeCheckpoints = writable<CommitteeCheckpoint[]>([])
export const checkpointError = writable('')
let loaded = false
let queue = Promise.resolve()

export function makeCheckpoint(conferenceId: string, committee: Committee, label: string): CommitteeCheckpoint {
  const { seats, ...data } = committee.toJSON()
  return JSON.parse(JSON.stringify({
    id: crypto.randomUUID(), conferenceId, committeeId: committee.id, createdAt: Date.now(), label, data,
    procedures: seats.map((seat) => ({ id: seat.id, procedure: seat.procedure })),
  }))
}

export function restoreCheckpoint(checkpoint: CommitteeCheckpoint, conferenceId: string, current: Committee): Committee {
  if (checkpoint.conferenceId !== conferenceId || checkpoint.committeeId !== current.id) throw new Error(t('services_checkpoint_wrong_committee'))
  if (checkpoint.procedures.some((seat) => !current.seats.some((item) => item.id === seat.id))) throw new Error(t('services_checkpoint_seats_removed'))
  const data = JSON.parse(JSON.stringify(checkpoint.data)) as CommitteeData
  const procedures = new Map(checkpoint.procedures.map((seat) => [seat.id, seat.procedure]))
  data.seats = current.seats.map((seat) => ({ ...seat, procedure: seat.procedure ? { ...seat.procedure, attendance: procedures.get(seat.id)?.attendance ?? seat.procedure.attendance } : undefined }))
  data.name = current.name
  if (data.activeSpeaker) data.activeSpeaker.paused = true
  if (data.activeCaucus) data.activeCaucus.paused = true
  const restored = Committee.fromJSON(data)
  restored.reconcileSeats(current.seats)
  return restored
}

export async function loadCheckpoints(): Promise<void> {
  if (loaded) return
  const data = await bootstrapStore<CommitteeCheckpoint[]>('checkpoints', [])
  if (!Array.isArray(data) || data.some((item) => !item.data || !Array.isArray(item.procedures))) throw new Error(t('services_checkpoint_corrupt'))
  committeeCheckpoints.set(data)
  loaded = true
}

export function saveCheckpoint(checkpoint: CommitteeCheckpoint): Promise<boolean> {
  let success = false
  queue = queue.then(async () => {
    try {
      await loadCheckpoints()
      const next = [checkpoint, ...get(committeeCheckpoints)]
      let matching = 0
      const bounded = next.filter((item) => item.conferenceId !== checkpoint.conferenceId || item.committeeId !== checkpoint.committeeId || ++matching <= 20).slice(0, 100)
      await saveToStore('checkpoints', bounded)
      committeeCheckpoints.set(bounded)
      checkpointError.set('')
      success = true
    } catch (error) { checkpointError.set(error instanceof Error ? error.message : t('services_checkpoint_save_failed')) }
  })
  return queue.then(() => success)
}
