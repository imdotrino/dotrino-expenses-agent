// Tipos de los pilares que no publican declaraciones (vault, remote-agent y update traen JS
// sin .d.ts). Solo lo que usa este agente, copiado de las firmas y el JSDoc de cada pilar.
// El certificado, el aparato y la llave de cifrado del enlace son del pilar y su forma no la
// fija este repo: van como `unknown`, este agente solo los pasa de un sitio a otro.

declare module '@dotrino/remote-agent/link' {
  /** El enlace del aparato con su bóveda, como lo guarda el pilar (cifrado en reposo). */
  export interface AgentLink {
    proxy?: string
    iss: string
    device: unknown
    cert: unknown
    enc?: unknown
    [field: string]: unknown
  }
  export function loadLink(dir?: string): AgentLink | null
  export function parseQr(text: string): Promise<unknown>
  export function enroll(opts: {
    qr: unknown
    label?: string
    dir?: string
    ns?: string | null
    onChallenge?: (c: { deviceId: string, code: string }) => void
    timeoutMs?: number
  }): Promise<unknown>
}

declare module '@dotrino/remote-agent/instances' {
  export function instancesRoot(kind: string): string
  export function listInstances(kind: string): string[]
  export function resolveInstance(kind: string, name?: string | null): { name: string, dir: string }
  /** Devuelve `release()`. Lanza `EALREADY` si ya corre otro proceso con el mismo enlace. */
  export function lockInstance(dir: string): () => void
}

declare module '@dotrino/remote-agent/agent' {
  /** Sesión cifrada con un dispositivo cliente (`AgentSession` del pilar). */
  export interface AgentSession {
    sid: string
    from: string
    device: string
    send(payload: unknown): Promise<void>
    on(event: 'message', handler: (msg: unknown) => void): void
    on(event: 'close', handler: () => void): void
  }
  export interface RemoteAgent {
    machine: string
    machineId: string
    master: string
    client: unknown
    close(): void
  }
  export function startRemoteAgent(opts?: {
    label?: string
    proxyUrl?: string
    dir?: string
    link?: unknown
    client?: unknown
    quiet?: boolean
    onReady?: () => void
    onRevoked?: () => void
    onSession?: (session: AgentSession) => void
  }): Promise<RemoteAgent>
}

declare module '@dotrino/vault/service' {
  /** Cómo encuentra un servicio a su bóveda: el cajón y la identidad del aparato. */
  export interface VaultConnection {
    ns?: string
    proxyUrl: string
    masterPubkey: string
    device: unknown
    cert: unknown
    enc?: unknown
  }
  export function fetchSecrets(args: VaultConnection & { timeoutMs?: number }): Promise<Record<string, string>>
  export function waitForSecrets(args: VaultConnection & {
    retryMs?: number
    maxRetryMs?: number
    onRetry?: (e: Error, ms: number) => void
  }): Promise<Record<string, string>>
  export function storeVars(args: VaultConnection & {
    vars: Array<{ key: string, value: string, public?: boolean }>
    timeoutMs?: number
  }): Promise<{ keys: string[], pending: string | null, approval: boolean }>
  export interface UpdateEvent { version: string, from?: string | null }
  export interface UpdateHooks {
    mayUpdate(u: UpdateEvent): Promise<boolean>
    onUpdated(u: UpdateEvent): Promise<void>
    onNeedsRoot(u: UpdateEvent): Promise<void>
  }
  export function vaultUpdateHooks(o: VaultConnection & { product: string, log?: (m: string) => void }): UpdateHooks
}

declare module '@dotrino/vault/device-info' {
  export function deviceInfo(link: unknown, extra?: Record<string, unknown>): Promise<Record<string, unknown>>
  export function formatDeviceInfo(info: Record<string, unknown>): string
}

declare module '@dotrino/update/npm' {
  export function updatePrefsCommand(args: string[], o: { dir: string, lang?: string }): {
    handled: boolean
    ok: boolean
    text: string
    prefs?: { approval: boolean, notify: boolean }
  }
  export function updateStatusText(o: { dir: string, current: string, lang?: string }): string
  /** El vigía de un daemon. Devuelve cómo pararlo. */
  export function watchSelfUpdateNpm(o: Record<string, unknown>): () => void
}
