# @dotrino/expenses-agent

> **Parte del ecosistema [Dotrino](https://dotrino.com).** Dotrino es un ecosistema de aplicaciones centradas en la privacidad de los datos: tu información es tuya, y las decisiones sobre ella también — qué compartes, con quién, cuándo y por qué. Sin anuncios, sin cookies, sin rastreo de datos, sin vender tu identidad a nadie.

El agente de [Expenses](https://expenses.dotrino.com) en tu PC. Lee los avisos del banco de tu
buzón por IMAP y se los pasa a la app cuando ella se los pide, por una sesión cifrada de punta
a punta ([`@dotrino/remote-agent`](https://github.com/imdotrino/dotrino-remote-agent)). En la app
caen en «Por confirmar»: nada entra al registro sin que lo aceptes.

Uso para quien no programa: [wiki.dotrino.com/apps/gastos/#correo](https://wiki.dotrino.com/apps/gastos/#correo).

## Lo que no hace, a propósito

- **No guarda tus credenciales en esta máquina.** Viven en el cajón `expenses` de tu bóveda,
  selladas; el agente las pide en cada lectura y no se quedan en memoria entre una y otra.
- **No guarda correos.** El buzón es el almacén: la app guarda en tu almacén hasta dónde leyó
  (el «cursor») y el agente lee lo nuevo desde ahí.
- **No es requisito.** Con el PC apagado la app funciona igual; solo deja de llegar correo nuevo.
  Sin agente, el aviso se puede pegar a mano.

## Instalar y poner en marcha

```bash
# 1. En el PC de tu bóveda: una invitación que deja leer el cajón «expenses»
dotrino-vault pair --service expenses --scope sign

# 2. En el PC donde va a correr el agente (puede ser el mismo)
npx @dotrino/expenses-agent              # enlaza (pega la invitación, aprueba el código) y corre
npx @dotrino/expenses-agent setup        # servidor, usuario, contraseña de aplicación, carpeta, remitentes
npx @dotrino/expenses-agent check        # prueba el buzón con lo guardado
```

Gmail y Outlook piden una **contraseña de aplicación** (con la verificación en dos pasos
encendida), no la de siempre. `IMAP_FROM` (remitentes separados por comas) hace que el servidor
filtre: solo se leen los correos del banco.

| Orden | |
|---|---|
| *(sin orden)* `[--name <n>]` | enlaza si falta y corre |
| `enroll` | re-enlaza (sobrescribe el enlace) |
| `setup` | sube los datos del buzón al cajón (`storeVars`: añadir es directo; cambiar uno existente espera la aprobación de tu bóveda) |
| `check` | conecta con lo guardado y lista los últimos avisos |
| `info [--json]` | qué aparato es: su ID, su bóveda, sus permisos (sin red) |
| `list` | los agentes enlazados en esta máquina |
| `update [--approval on\|off] [--notify on\|off]` | cómo se actualiza (por defecto, solo; CONVENCIONES §15) |

Enlaces en `~/.dotrino/agent/expenses-agent/<nombre>/` (`DOTRINO_AGENT_HOME` cambia la raíz).

## Protocolo (lo que habla con la PWA)

Por la sesión de `@dotrino/remote-agent`, con `re` para emparejar pregunta y respuesta:

| Pide la PWA | Contesta el agente |
|---|---|
| `{ type: 'status' }` | `{ type: 'status', configured, mailbox: { host, user (a medias), folder, from }, version }` |
| `{ type: 'pull', cursor }` | `{ type: 'mails', mails: [{ id, from, subject, date, text }], cursor }` |
| — | `{ type: 'fail', code, message }` |

El cursor es `{ uidValidity, uid }`. Sin cursor (o si la carpeta se renumeró) se miran los
últimos 30 días y el cursor queda en el último correo de la carpeta; después, lo nuevo en orden,
como mucho 50 por lectura. El agente contesta `kind: 'expenses-agent'` al ping, que es como la
app lo encuentra entre los aparatos de la cuenta.

Códigos: `not-configured` · `bad-config` · `imap-auth` · `imap-unreachable` · `imap-folder` ·
`imap-failed` · `not-linked` · `unknown-type`.

## Desarrollo

```bash
npm test             # unitarias
npm run test:imap    # contra un IMAP de verdad (GreenMail en Docker)
```

## Licencia

MIT.
