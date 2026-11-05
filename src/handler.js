// Lo que contesta el agente a la PWA, por la sesión cifrada (@dotrino/remote-agent).
//
//   { type: 'status' }                       → { type: 'status', configured, mailbox?, code?, version }
//   { type: 'pull', cursor, limit? }         → { type: 'mails', mails, cursor }
//   cualquier fallo                          → { type: 'fail', code, message }
//
// Las credenciales se piden a la bóveda en cada petición (no se guardan en memoria entre
// una y otra): así un cambio en el cajón vale a la siguiente, y una contraseña no se queda
// en el proceso más de lo que dura una lectura.

import { configFromSecrets, publicConfig } from './config.js'
import { fetchMails } from './imap.js'

/** @typedef {import('./types.js').AgentReply} AgentReply */
/** @typedef {import('./types.js').CodeError} CodeError */

/**
 * @param {{ loadSecrets: () => Promise<Record<string,string>>, fetch?: import('./types.js').FetchMails, version: string, log?: (m:string)=>void }} deps
 * @returns {(msg: unknown) => Promise<AgentReply | null>}
 */
export function makeHandler ({ loadSecrets, fetch = fetchMails, version, log = () => {} }) {
  // Una lectura por cursor a la vez: dos pestañas pidiendo lo mismo comparten la lectura.
  /** @type {Map<string, Promise<import('./types.js').FetchResult>>} */
  const busy = new Map()

  async function config () {
    return configFromSecrets(await loadSecrets())
  }

  /**
   * @param {unknown} raw lo que llega por la sesión cifrada
   * @returns {Promise<AgentReply | null>}
   */
  return async function handle (raw) {
    if (!raw || typeof raw !== 'object') return null
    const msg = /** @type {import('./types.js').AgentRequest} */ (raw)
    try {
      if (msg.type === 'status') {
        try {
          const cfg = await config()
          return { type: 'status', configured: true, mailbox: publicConfig(cfg), version }
        } catch (err) {
          const e = /** @type {CodeError} */ (err)
          if (e.code === 'not-configured') return { type: 'status', configured: false, code: e.code, version }
          throw e
        }
      }
      if (msg.type === 'pull') {
        const cursor = validCursor(msg.cursor)
        const key = JSON.stringify(cursor)
        let read = busy.get(key)
        if (!read) {
          read = (async () => {
            const cfg = await config()
            const res = await fetch(cfg, cursor, { limit: msg.limit })
            log(`pulled ${res.mails.length} mail(s) from ${cfg.folder}`)
            return res
          })().finally(() => busy.delete(key))
          busy.set(key, read)
        }
        const { mails, cursor: next } = await read
        return { type: 'mails', mails, cursor: next }
      }
      return { type: 'fail', code: 'unknown-type', message: `unknown message type: ${msg.type}` }
    } catch (err) {
      const e = /** @type {CodeError} */ (err)
      log(`${msg.type} failed: ${e.code || 'error'} ${e.message}`)
      return { type: 'fail', code: e.code || 'agent-failed', message: String(e.message || e) }
    }
  }
}

/**
 * El cursor que manda la PWA, si vale; si no, `null` (se lee por fecha).
 * @param {any} c
 * @returns {import('./types.js').Cursor | null}
 */
function validCursor (c) {
  if (!c) return null
  if (typeof c !== 'object' || !c.uidValidity || !Number.isSafeInteger(Number(c.uid))) return null
  return { uidValidity: String(c.uidValidity), uid: Number(c.uid) }
}
