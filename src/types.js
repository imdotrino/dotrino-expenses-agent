// Las formas de datos que van y vienen entre la bóveda, el buzón y la PWA. Solo tipos.

/**
 * La configuración del buzón, sacada del cajón de la bóveda (`configFromSecrets`).
 * @typedef {{ host: string, port: number, secure: boolean, user: string, password: string, folder: string, from: string[] }} ImapConfig
 */

/**
 * Hasta dónde se leyó una carpeta: el UID del último correo traído y su UIDVALIDITY.
 * @typedef {{ uidValidity: string, uid: number }} Cursor
 */

/**
 * Un correo, tal como se le pasa a la PWA.
 * @typedef {{ id: string, from: string, subject: string, date: string | null, text: string }} Mail
 */

/**
 * Lo que devuelve una lectura del buzón.
 * @typedef {{ mails: Mail[], cursor: Cursor }} FetchResult
 */

/**
 * Lo que se le enseña a la PWA del buzón: sin contraseña y con el usuario a medias.
 * @typedef {{ host: string, user: string, folder: string, from: string[] }} PublicConfig
 */

/**
 * Las respuestas de `setup`, antes de pasarlas a variables del cajón.
 * @typedef {{ host: string, port?: string | number, user: string, password: string, folder?: string, from?: string }} SetupAnswers
 */

/**
 * Lo que pide la PWA por la sesión cifrada.
 * @typedef {{ type?: string, cursor?: unknown, limit?: number, re?: unknown }} AgentRequest
 */

/**
 * Lo que contesta el agente.
 * @typedef {{ type: 'status', configured: boolean, mailbox?: PublicConfig, code?: string, version: string }
 *   | { type: 'mails', mails: Mail[], cursor: Cursor }
 *   | { type: 'fail', code: string, message: string }} AgentReply
 */

/**
 * Un Error con `code`, para decidir por el código y no por la frase.
 * @typedef {Error & { code: string, [field: string]: unknown }} CodeError
 */

/**
 * Lee el buzón (`fetchMails`), con sus dependencias inyectables para las pruebas.
 * @typedef {(cfg: ImapConfig, cursor: Cursor | null, deps?: { ImapFlow?: any, simpleParser?: (source: any) => Promise<any>, now?: () => number, limit?: number }) => Promise<FetchResult>} FetchMails
 */

export {}
