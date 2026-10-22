#!/usr/bin/env node
/**
 * dotrino-expenses-agent — el agente de Expenses en tu PC.
 *
 *   dotrino-expenses-agent [--name <n>]          enlaza (si falta) y CORRE el agente
 *   dotrino-expenses-agent enroll [--name <n>]   re-enlaza (sobrescribe el enlace)
 *   dotrino-expenses-agent setup [--name <n>]    guarda los datos de tu buzón en tu bóveda
 *   dotrino-expenses-agent check [--name <n>]    prueba el buzón y dice cuántos avisos ve
 *   dotrino-expenses-agent list                  los agentes enlazados en esta máquina
 *   dotrino-expenses-agent info [--name <n>]     qué aparato es: su ID, su bóveda, sus permisos
 *   dotrino-expenses-agent update [--name <n>] [--approval on|off] [--notify on|off]
 */
import readline from 'node:readline'
import { createRequire } from 'node:module'
import { updatePrefsCommand, updateStatusText } from '@dotrino/update/npm'
import { enroll, parseQr, loadLink } from '@dotrino/remote-agent/link'
import { resolveInstance, listInstances, lockInstance, instancesRoot } from '@dotrino/remote-agent/instances'
import { deviceInfo, formatDeviceInfo } from '@dotrino/vault/device-info'
import { startExpensesAgent, secretsArgs, LABEL } from '../index.js'
import { NS, varsFromAnswers, configFromSecrets, publicConfig } from '../src/config.js'

const KIND = LABEL
const { version: VERSION } = createRequire(import.meta.url)('../package.json')
const args = process.argv.slice(2)
const cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'run'
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

function ask (q, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) {
    // Lo tecleado no se ve: una contraseña no se queda en la pantalla ni en el scroll.
    rl._writeToOutput = (s) => { if (s.startsWith(q)) rl.output.write(q) }
  }
  return new Promise((res) => rl.question(q, (a) => { if (hidden) rl.output.write('\n'); rl.close(); res(a) }))
}

if (args.includes('-h') || args.includes('--help')) {
  console.log(`uso:
  dotrino-expenses-agent [--name <n>]          enlaza este agente (si falta) y lo corre
  dotrino-expenses-agent enroll [--name <n>]   re-enlaza (sobrescribe el enlace)
  dotrino-expenses-agent setup [--name <n>]    guarda los datos de tu buzón (servidor, usuario,
                                               contraseña, carpeta, remitentes) en el cajón
                                               «${NS}» de tu bóveda. Aquí no queda nada.
  dotrino-expenses-agent check [--name <n>]    prueba el buzón con lo guardado
  dotrino-expenses-agent list                  los agentes enlazados en esta máquina
  dotrino-expenses-agent info [--name <n>]     qué aparato es: su ID (el de «dotrino-vault members»),
                                               su bóveda y sus permisos. Sin red. [--json]
  dotrino-expenses-agent update [--name <n>]   cómo se actualiza (por defecto, solo):
                                                 --approval on|off  pedir antes aprobación a tu bóveda
                                                 --notify on|off    avisar cuando se actualiza
  opciones: [--name <n>] [--proxy <wss://…>] [--dir <ruta>]

La invitación se genera en tu bóveda con:  dotrino-vault pair --service ${NS} --scope sign

enlaces en ${instancesRoot(KIND)}/<nombre> (override DOTRINO_AGENT_HOME; --dir o
DOTRINO_REMOTE_AGENT_DIR fuerzan una carpeta concreta)`)
  process.exit(0)
}

function instance () {
  const fixed = opt('--dir') || process.env.DOTRINO_REMOTE_AGENT_DIR
  return fixed ? { name: null, dir: fixed } : resolveInstance(KIND, opt('--name'))
}

function linkedOrExit (dir) {
  const link = loadLink(dir)
  if (!link) { console.error(`Este agente no está enlazado (${dir}). Enlázalo con: dotrino-expenses-agent`); process.exit(1) }
  return link
}

if (cmd === 'list') {
  const names = listInstances(KIND)
  if (!names.length) console.log('No hay ningún agente enlazado en esta máquina.')
  for (const n of names) console.log(`  ${n}   ${instancesRoot(KIND)}/${n}`)
  process.exit(0)
}

if (cmd === 'update') {
  let r
  try {
    const dir = instance().dir
    const own = args.slice(1).filter((a, i, all) => !['--name', '--dir'].includes(a) && !['--name', '--dir'].includes(all[i - 1]))
    r = updatePrefsCommand(own, { dir, lang: 'es' })
  } catch (e) { console.error('error:', e.message); process.exit(1) }
  if (!r.handled) { console.error('uso: dotrino-expenses-agent update [--name <n>] [--approval on|off] [--notify on|off]'); process.exit(2) }
  ;(r.ok ? console.log : console.error)(r.text)
  process.exit(r.ok ? 0 : 2)
}

if (cmd === 'info') {
  try {
    const inst = instance()
    const link = linkedOrExit(inst.dir)
    const info = await deviceInfo(link, { kind: KIND, name: inst.name, version: VERSION, dir: inst.dir })
    const pending = updateStatusText({ dir: inst.dir, current: VERSION, lang: 'es' })
    if (args.includes('--json')) console.log(JSON.stringify(pending ? { ...info, update: pending } : info, null, 2))
    else console.log(formatDeviceInfo(info) + (pending ? '\n' + pending : ''))
  } catch (e) { console.error('error:', e.message); process.exit(1) }
  process.exit(0)
}

if (cmd === 'setup') {
  try {
    const link = linkedOrExit(instance().dir)
    console.log(`Los datos de tu buzón se guardan cifrados en el cajón «${NS}» de tu bóveda.`)
    console.log('En esta máquina no queda nada escrito.\n')
    console.log('Gmail, Outlook y otros piden una «contraseña de aplicación», no la de siempre.')
    console.log('Cómo se saca: https://wiki.dotrino.com/apps/gastos/#correo\n')
    const host = (await ask('Servidor IMAP (p. ej. imap.gmail.com): ')).trim()
    const port = (await ask('Puerto [993]: ')).trim() || '993'
    const user = (await ask('Usuario (tu correo): ')).trim()
    const password = await ask('Contraseña de aplicación: ', { hidden: true })
    const folder = (await ask('Carpeta o etiqueta [INBOX]: ')).trim() || 'INBOX'
    const from = (await ask('Solo de estos remitentes, separados por comas (vacío = todos): ')).trim()
    const vars = varsFromAnswers({ host, port, user, password, folder, from })
    configFromSecrets(Object.fromEntries(vars.map((v) => [v.key, v.value])))   // valida antes de mandar
    const { storeVars } = await import('@dotrino/vault/service')
    const r = await storeVars({ ...secretsArgs(link), vars })
    if (r.pending) console.log(`\n  Algunos datos ya existían: cambiarlos espera la aprobación de tu bóveda (pedido ${r.pending}).`)
    else console.log(`\n  ✓ Guardado en tu bóveda: ${r.keys.join(', ')}`)
    console.log('  Pruébalo con: dotrino-expenses-agent check\n')
  } catch (e) { console.error('error:', e.code ? `${e.code}: ${e.message}` : e.message); process.exit(1) }
  process.exit(0)
}

if (cmd === 'check') {
  try {
    const link = linkedOrExit(instance().dir)
    const { fetchSecrets } = await import('@dotrino/vault/service')
    const { fetchMails } = await import('../src/imap.js')
    const cfg = configFromSecrets(await fetchSecrets(secretsArgs(link)))
    const pub = publicConfig(cfg)
    console.log(`Buzón ${pub.user} en ${pub.host}, carpeta ${pub.folder}${pub.from.length ? `, remitentes ${pub.from.join(', ')}` : ''}`)
    const { mails } = await fetchMails(cfg, null, { limit: 5 })
    console.log(`  ✓ Conecta. Últimos ${mails.length} correo(s) de los últimos 30 días:`)
    for (const m of mails) console.log(`    · ${m.date?.slice(0, 10) || '?'}  ${m.from}  ${m.subject}`)
  } catch (e) { console.error('error:', e.code ? `${e.code}: ${e.message}` : e.message); process.exit(1) }
  process.exit(0)
}

async function doEnroll (dir) {
  console.log('Enlazar esta máquina con tu bóveda.')
  console.log(`En el PC de tu bóveda corre:  dotrino-vault pair --service ${NS} --scope sign`)
  console.log('y pega aquí el código o el JSON que te da.\n')
  const text = await ask('Pega el código y Enter:\n> ')
  const qr = await parseQr(text)
  console.log('\nConectando…')
  await enroll({
    qr,
    dir,
    label: KIND,
    ns: NS,
    onChallenge: ({ deviceId, code }) => {
      console.log('\n  Escribe ESTE código en tu bóveda para aprobar esta máquina:')
      console.log(`    código: ${code}`)
      console.log(`    máquina: ${deviceId}`)
      console.log(`    (en el PC de la bóveda:  dotrino-vault approve ${code})\n`)
      console.log('  Esperando aprobación…')
    },
  })
  console.log('\n  ✓ Máquina enlazada. Ahora guarda los datos de tu buzón:  dotrino-expenses-agent setup\n')
}

try {
  const inst = instance()
  const dir = inst.dir
  process.on('exit', lockInstance(dir))
  if (cmd === 'enroll' || !loadLink(dir)) {
    if (!process.stdin.isTTY) {
      console.error('No estás enlazado y no hay terminal interactiva para hacerlo.')
      console.error('Enlázalo antes en una terminal:  npx @dotrino/expenses-agent enroll')
      process.exit(1)
    }
    if (cmd === 'enroll' && loadLink(dir)) console.log('Re-enlazando esta máquina (sobrescribe el enlace actual).\n')
    await doEnroll(dir)
    if (cmd === 'enroll') process.exit(0)
  }
  if (cmd !== 'run') { console.error(`orden desconocida: ${cmd} (mira --help)`); process.exit(2) }

  const agent = await startExpensesAgent({
    dir, version: VERSION, proxyUrl: opt('--proxy'),
    onRevoked: () => { console.log('  Esta máquina fue revocada desde tu bóveda. Para reconectarla, vuelve a enlazarla.\n'); process.exit(0) },
  })
  console.log('\n  Expenses — agente activo')
  console.log('  versión:', VERSION)
  if (inst.name) console.log('  nombre:', inst.name)
  console.log('  máquina:', agent.machineId)
  console.log('  la app lo encuentra sola en expenses.dotrino.com\n')
  const { startSelfUpdate } = await import('../update.js')
  const stopUpdates = startSelfUpdate({ dir, version: VERSION, agent })
  const keepAlive = setInterval(() => {}, 1 << 30)
  const bye = () => { clearInterval(keepAlive); stopUpdates(); agent.close(); process.exit(0) }
  process.on('SIGINT', bye); process.on('SIGTERM', bye)
} catch (e) {
  console.error('error:', e.message)
  process.exit(1)
}
