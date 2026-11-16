import { writable } from 'svelte/store'

export const settingsDialogOpen = writable(false)

export const joinConferenceDialogOpen = writable(false)

export const alertDialogStore = writable<{
  open: boolean
  title: string
  description: string
  onConfirm?: () => void
}>({
  open: false,
  title: '',
  description: ''
})

export function showAlert(title: string, description: string) {
  alertDialogStore.set({ open: true, title, description })
}

export function showConfirm(title: string, description: string, onConfirm: () => void) {
  alertDialogStore.set({ open: true, title, description, onConfirm })
}

export function hideAlert() {
  alertDialogStore.update((state) => ({ ...state, open: false, onConfirm: undefined }))
}
