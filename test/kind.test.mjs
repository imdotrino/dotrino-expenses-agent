// La app encuentra este agente preguntándole QUÉ ES (`probeAgents`): el nombre que tiene en el
// acta lo pone el dueño al emparejar y no dice nada. Si el pong dejara de decir
// `expenses-agent`, la máquina desaparecería de la app sin ningún error a la vista.
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeDeviceKey } from '@dotrino/identity/capabilities'
import { probeAgents } from '@dotrino/remote-agent/discover'
import { startExpensesAgent } from '../index.js'

function fakeClient () {
  const handlers = []
  return {
    token: 'tok',
    on (ev, cb) { if (ev === 'message') handlers.push(cb); return () => handlers.splice(handlers.indexOf(cb), 1) },
    async identifyAs () {},
    send (_to, p) { for (const h of [...handlers]) h('agent', p) },
    sendByPubkey (_to, p) { setTimeout(() => { for (const h of [...handlers]) h('app', p) }, 1) },
    close () {},
  }
}

test('the agent answers the ping as expenses-agent', async () => {
  const device = await makeDeviceKey({ label: 'expenses-agent' })
  const link = { device, cert: { sub: device.publickey }, iss: device.publickey }
  const client = fakeClient()
  const agent = await startExpensesAgent({ link, client, quiet: true, version: '0.0.0', dir: '/tmp/expenses-agent-test-' + process.pid, loadSecrets: async () => ({}) })
  const found = await probeAgents(client, [device.publickey], { timeoutMs: 200 })
  assert.equal(found.get(device.publickey)?.kind, 'expenses-agent')
  agent.close()
})
