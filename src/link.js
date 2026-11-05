// Lo que este agente necesita de SU enlace (el que guarda `@dotrino/remote-agent/link`) para
// hablar con su bóveda: un solo sitio, lo usan los secretos (index.js) y la actualización (update.js).

/** El proxio por defecto, si el enlace no dice otro. */
export const DEFAULT_PROXY = 'wss://proxy.dotrino.com'

/**
 * Quién es este aparato ante su bóveda, sacado del enlace.
 * @param {{ proxy?: string, iss: string, device: string, cert: object }} link
 */
export function vaultIdentity (link) {
  return { proxyUrl: link.proxy || DEFAULT_PROXY, masterPubkey: link.iss, device: link.device, cert: link.cert }
}
