export type SyncAction = 'upload' | 'download' | 'delete-cloud' | 'delete-local' | 'unchanged' | 'conflict'

/** Compare both copies to the last successful sync, without relying on device clocks. */
export function planConferenceSync(local: string | undefined, remote: string | undefined, baseline: string | undefined): SyncAction {
  if (local === remote) return 'unchanged'
  if (!baseline) {
    if (!local) return 'download'
    if (!remote) return 'upload'
    return 'conflict'
  }
  if (local === baseline) return remote ? 'download' : 'delete-local'
  if (remote === baseline) return local ? 'upload' : 'delete-cloud'
  return 'conflict'
}
