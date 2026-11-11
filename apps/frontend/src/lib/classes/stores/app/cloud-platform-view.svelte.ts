import { writable, type Readable } from 'svelte/store'

export interface CloudPlatformViewState {
  open: boolean
  canGoBack: boolean
  canGoForward: boolean
}

interface CloudPlatformView extends Readable<CloudPlatformViewState> {
  open: () => void
  close: () => void
  goBack: () => void
  goForward: () => void
}

const state = writable<CloudPlatformViewState>({
  open: false,
  canGoBack: false,
  canGoForward: false
})

export const cloudPlatformView: CloudPlatformView = {
  subscribe: state.subscribe,
  open: () => {
    if (typeof window === 'undefined') return
    if (window.veto?.cloudPlatform) {
      window.veto.cloudPlatform.open()
      return
    }
    window.location.assign('https://platform.miaoyww.top/?from=app')
  },
  close: () => window.veto?.cloudPlatform?.close(),
  goBack: () => window.veto?.cloudPlatform?.goBack(),
  goForward: () => window.veto?.cloudPlatform?.goForward()
}

if (typeof window !== 'undefined' && window.veto?.cloudPlatform) {
  window.veto.cloudPlatform.onChanged((next: CloudPlatformViewState) => state.set(next))
}
