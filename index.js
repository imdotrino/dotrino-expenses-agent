/**
 * @dotrino/expenses-agent — el agente de Expenses en tu PC (Node).
 *
 * Lee los avisos del banco de tu buzón por IMAP y se los pasa a expenses.dotrino.com cuando la
 * app se los pide, por una sesión cifrada de punta a punta (`@dotrino/remote-agent`). Las
 * credenciales del buzón viven en el cajón `expenses` de tu bóveda; aquí no se guarda nada
 * más que el enlace del aparato.
 */
import { startRemoteAgent } from '@dotrino/remote-agent/agent'
import { waitForSecrets } from '@dotrino/vault/service'
import { makeHandler } from './src/handler.js'
import { NS } from './src/config.js'

export const LABEL = 'expenses-agent'

/** Lo que piden `fetchSecrets`/`storeVars` con la identidad de un agente de remote-agent. */
export function secretsArgs (link) {
  return { ns: NS, proxyUrl: link.proxy || 'wss://proxy.dotrino.com', masterPubkey: link.iss, device: link.device, cert: link.cert, enc: link.enc }
}

/**
 * @param {{ dir: string, version: string, proxyUrl?: string, link?: object, client?: object, quiet?: boolean,
 *   onReady?: Function, onRevoked?: Function, loadSecrets?: () => Promise<Record<string,string>>, fetch?: Function, log?: Function }} opts
 */
export async function startExpensesAgent (opts) {
  const log = opts.log || ((m) => console.log(`[expenses-agent] ${m}`))
  const { loadLink } = await import('@dotrino/remote-agent/link')
  // Se lee el enlace en cada petición: el papel se renueva mientras el agente corre.
  const loadSecrets = opts.loadSecrets || (async () => {
    const link = opts.link || loadLink(opts.dir)
    if (!link) throw Object.assign(new Error('this agent is not linked to a vault'), { code: 'not-linked' })
    return waitForSecrets({ ...secretsArgs(link), retryMs: 3000, maxRetryMs: 15000, onRetry: (e, ms) => log(`vault: ${e.message}; retry in ${Math.round(ms / 1000)}s`) })
  })
  const handle = makeHandler({ loadSecrets, fetch: opts.fetch, version: opts.version, log })
  return startRemoteAgent({
    label: LABEL,
    proxyUrl: opts.proxyUrl,
    dir: opts.dir,
    link: opts.link,
    client: opts.client,
    quiet: opts.quiet,
    onReady: opts.onReady,
    onRevoked: opts.onRevoked,
    onSession (session) {
      session.on('message', async (msg) => {
        const reply = await handle(msg)
        if (reply) await session.send({ ...reply, re: msg?.re ?? null }).catch((e) => log(`reply failed: ${e.message}`))
      })
    },
  })
}

export default { startExpensesAgent, LABEL }
