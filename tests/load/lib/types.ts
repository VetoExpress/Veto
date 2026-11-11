export type Topic = 'files' | 'notifications' | 'news' | 'directives' | 'situations' | 'timeline'
export interface LoadConfig {
  target: string
  environment: 'local' | 'cloudflare'
  scenario: 'browse' | 'mixed' | 'files' | 'reconnect' | 'display'
  profile: string
  vus: number
  durationSeconds: number
  rampSeconds: number
  rampSteps?: number
  startDelaySeconds: number
  onlineWindowSeconds?: number
  actionIntervalSeconds: number
  filesPerVu: number
  uploadConcurrency: number
  fileSizesBytes: number[]
  visibility: 'committee' | 'conference'
  fileType: string
  readyTimeoutSeconds: number
  visibilityTimeoutSeconds: number
  requestTimeoutSeconds: number
  reconnectAfterSeconds: number
  openLoopSeed?: number
  displayWsUrl?: string
  wsAllowedHosts: string[]
  observerEvery?: number
  thresholds: { httpP95Ms: number; uploadP95Ms: number; visibleP95Ms: number; errorRate: number }
}
export interface SeatCredential {
  inviteCode: string
  password: string
  seatId?: string
  conferenceId?: string
  committeeId?: string
  targetCommitteeId?: string
  expectedCapabilities?: string[]
}
export interface Identity {
  seatId: string
  conferenceId: string
  committeeId: string
  capabilities: string[]
}
export interface Authentication {
  token: string
  wsUrl: string
  identity: Identity
}
export interface Content {
  id: string
  title?: string
  content?: string
  sourceSeatId?: string
  sourceCommitteeId?: string
  targetCommitteeId?: string
  status?: string
  claimedByMe?: boolean
  fileName?: string
  size?: number
  [key: string]: unknown
}
export interface SummaryMetric {
  type: string
  values: Record<string, number>
  thresholds?: Record<string, { ok: boolean }>
}
export interface Summary {
  metrics: Record<string, SummaryMetric>
  state?: { testRunDurationMs?: number }
}
