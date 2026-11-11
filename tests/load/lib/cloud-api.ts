import http from 'k6/http'
import type { Params, RefinedResponse, ResponseType } from 'k6/http'
import { sha256 } from 'k6/crypto'
import { conflicts, recordError } from './metrics.ts'
import type { Authentication, Content, LoadConfig, SeatCredential } from './types.ts'

export class RequestError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly expectedConflict = false
  ) {
    super(`${operation}:${status}`)
  }
}

export class CloudApi {
  token = ''
  constructor(readonly config: LoadConfig) {}

  private async send<T extends ResponseType>(
    method: string,
    path: string,
    operation: string,
    body: string | ArrayBuffer | null,
    responseType: T,
    headers: Record<string, string> = {},
    expectedConflict = false
  ): Promise<RefinedResponse<T>> {
    const params: Params = {
      headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...headers },
      timeout: `${this.config.requestTimeoutSeconds}s`,
      redirects: 0,
      responseType,
      tags: { name: operation, operation },
      ...(expectedConflict
        ? { responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 409) }
        : {})
    }
    let response: RefinedResponse<T>
    try {
      response = (await http.asyncRequest(
        method,
        `${this.config.target}${path}`,
        body,
        params
      )) as RefinedResponse<T>
    } catch {
      recordError(operation, 'transport')
      throw new RequestError(operation, 0)
    }
    if (response.status < 200 || response.status >= 300) {
      if (expectedConflict && response.status === 409) conflicts.add(1, { operation })
      else {
        // Cloudflare's resource-limit errors can be delivered inside a 5xx response.
        const resourceExceeded =
          typeof response.body === 'string' && /1102|exceeded resource limits/i.test(response.body)
        recordError(
          operation,
          resourceExceeded
            ? 'cloudflare_resource_limit'
            : response.status === 429
              ? 'rate_limited'
              : response.status === 413
                ? 'body_too_large'
                : 'http',
          response.status
        )
      }
      throw new RequestError(
        operation,
        response.status,
        expectedConflict && response.status === 409
      )
    }
    return response
  }

  async json(
    method: string,
    path: string,
    operation: string,
    body?: unknown,
    headers: Record<string, string> = {},
    expectedConflict = false
  ): Promise<Record<string, unknown>> {
    const response = await this.send(
      method,
      path,
      operation,
      body === undefined ? null : JSON.stringify(body),
      'text',
      { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      expectedConflict
    )
    try {
      const value = response.json()
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('object required')
      if ('ok' in value && value.ok !== true) throw new Error('ok false')
      return value as Record<string, unknown>
    } catch {
      recordError(operation, 'invalid_response')
      throw new RequestError(operation, response.status)
    }
  }

  async authenticate(credential: SeatCredential): Promise<Authentication> {
    const result = (await this.json('POST', '/veto/join/authenticate', 'seat.authenticate', {
      inviteCode: credential.inviteCode,
      password: credential.password
    })) as unknown as Authentication
    const identity = result.identity
    if (
      !result.token ||
      !result.wsUrl ||
      !identity?.seatId ||
      !identity.committeeId ||
      !identity.conferenceId ||
      !Array.isArray(identity.capabilities) ||
      (credential.seatId && identity.seatId !== credential.seatId) ||
      (credential.committeeId && identity.committeeId !== credential.committeeId) ||
      (credential.conferenceId && identity.conferenceId !== credential.conferenceId) ||
      credential.expectedCapabilities?.some(
        (capability) => !identity.capabilities.includes(capability)
      )
    ) {
      recordError('seat.authenticate', 'identity_mismatch')
      throw new Error('IDENTITY_MISMATCH')
    }
    this.token = result.token
    return result
  }

  async list(path: string, key: string, operation: string): Promise<Content[]> {
    const result = await this.json('GET', path, operation)
    const items = result[key]
    if (!Array.isArray(items) || items.some((item) => !item || typeof item.id !== 'string')) {
      recordError(operation, 'invalid_list')
      throw new Error('INVALID_LIST')
    }
    return items as Content[]
  }

  async upload(
    body: ArrayBuffer,
    title: string,
    fileType = this.config.fileType
  ): Promise<Content> {
    const response = await this.send('POST', '/veto/files', 'file.upload', body, 'text', {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(`${title}.bin`),
      'X-File-Title': encodeURIComponent(title),
      'X-File-Type': encodeURIComponent(fileType),
      'X-File-Visibility': this.config.visibility,
      'X-File-Size': String(body.byteLength)
    })
    let item: Content | undefined
    try {
      item = (response.json() as { file?: Content })?.file
    } catch {
      /* Report below. */
    }
    if (
      !item?.id ||
      item.size !== body.byteLength ||
      item.title !== title ||
      item.status !== 'submitted'
    ) {
      recordError('file.upload', 'invalid_file_response')
      throw new Error('INVALID_FILE_RESPONSE')
    }
    return item
  }

  async download(id: string, expectedHash: string): Promise<boolean> {
    const response = await this.send(
      'GET',
      `/veto/files/${encodeURIComponent(id)}/download`,
      'file.download',
      null,
      'binary'
    )
    return response.body instanceof ArrayBuffer && sha256(response.body, 'hex') === expectedHash
  }
}
