import { is } from '@electron-toolkit/utils'
import type { IpcMainInvokeEvent } from 'electron'
import { getDevServerOrigin } from '../dev-server'

export function isAccountOrigin(origin: string, development: boolean): boolean {
  return (
    origin === 'veto://app' ||
    origin === 'https://platform.miaoyww.top' ||
    (development &&
      [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:4174',
        'http://localhost:3000',
        getDevServerOrigin()
      ].includes(origin))
  )
}

export function isTrustedAppFrame(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return !!frame && frame === event.sender.mainFrame && isAccountOrigin(frame.origin, is.dev)
}
