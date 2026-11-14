import { writable, type Readable } from 'svelte/store'

export interface CloudPlatformViewState {
  open: boolean
  canGoBack: boolean
  canGoForward: boolean
}

interface CloudPlatformView extends Readable<CloudPlatformViewState> {
  open: (path?: string) => void
  close: () => void
  setVisible: (visible: boolean) => void
  wheel: (input: { x: number; y: number; deltaX: number; deltaY: number }) => void
  goBack: () => void
  goForward: () => void
}

const CLOUD_PLATFORM_ORIGIN = 'https://platform.miaoyww.top'

function cloudPlatformUrl(path = '/'): string {
  const url = new URL(path, CLOUD_PLATFORM_ORIGIN)
  if (url.origin !== CLOUD_PLATFORM_ORIGIN) return `${CLOUD_PLATFORM_ORIGIN}/?from=app`
  url.searchParams.set('from', 'app')
  return url.toString()
}

const state = writable<CloudPlatformViewState>({
  open: false,
  canGoBack: false,
  canGoForward: false
})

export const cloudPlatformView: CloudPlatformView = {
  subscribe: state.subscribe,
  open: (path) => {
    if (typeof window === 'undefined') return
    if (window.veto?.cloudPlatform) {
      window.veto.cloudPlatform.open(path)
      return
    }
    window.location.assign(cloudPlatformUrl(path))
  },
  close: () => window.veto?.cloudPlatform?.close(),
  setVisible: (visible) => window.veto?.cloudPlatform?.setVisible(visible),
  wheel: (input) => window.veto?.cloudPlatform?.wheel(input),
  goBack: () => window.veto?.cloudPlatform?.goBack(),
  goForward: () => window.veto?.cloudPlatform?.goForward()
}

if (typeof window !== 'undefined' && window.veto?.cloudPlatform) {
  window.veto.cloudPlatform.onChanged((next: CloudPlatformViewState) => state.set(next))
}
