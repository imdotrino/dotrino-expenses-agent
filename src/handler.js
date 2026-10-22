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

/**
 * @param {{ loadSecrets: () => Promise<Record<string,string>>, fetch?: typeof fetchMails, version: string, log?: (m:string)=>void }} deps
 */
export function makeHandler ({ loadSecrets, fetch = fetchMails, version, log = () => {} }) {
  // Una lectura por cursor a la vez: dos pestañas pidiendo lo mismo comparten la lectura.
  const busy = new Map()

  async function config () {
    return configFromSecrets(await loadSecrets())
  }

  return async function handle (msg) {
    if (!msg || typeof msg !== 'object') return null
    try {
      if (msg.type === 'status') {
        try {
          const cfg = await config()
          return { type: 'status', configured: true, mailbox: publicConfig(cfg), version }
        } catch (e) {
          if (e.code === 'not-configured') return { type: 'status', configured: false, code: e.code, version }
          throw e
        }
      }
      if (msg.type === 'pull') {
        const cursor = validCursor(msg.cursor)
        const key = JSON.stringify(cursor)
        if (!busy.has(key)) {
          busy.set(key, (async () => {
            const cfg = await config()
            const res = await fetch(cfg, cursor, { limit: msg.limit })
            log(`pulled ${res.mails.length} mail(s) from ${cfg.folder}`)
            return res
          })().finally(() => busy.delete(key)))
        }
        const { mails, cursor: next } = await busy.get(key)
        return { type: 'mails', mails, cursor: next }
      }
      return { type: 'fail', code: 'unknown-type', message: `unknown message type: ${msg.type}` }
    } catch (e) {
      log(`${msg.type} failed: ${e.code || 'error'} ${e.message}`)
      return { type: 'fail', code: e.code || 'agent-failed', message: String(e.message || e) }
    }
  }
}

function validCursor (c) {
  if (!c) return null
  if (typeof c !== 'object' || !c.uidValidity || !Number.isSafeInteger(Number(c.uid))) return null
  return { uidValidity: String(c.uidValidity), uid: Number(c.uid) }
}
