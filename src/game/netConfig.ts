// Where multiplayer finds its servers: the build variables `VITE_SIGNAL_URL` and
// `VITE_STUN_URLS`, overridden by the URL parameters `signal` and `stun`. Pure parsing.

export interface SignalServer {
  host: string;
  port: number;
  /** Always starts and ends with a slash (as the PeerJS client wants it). */
  path: string;
  /** TLS: `wss` / `https`. */
  secure: boolean;
}

export interface NetConfig {
  /** The PeerJS server, or null: multiplayer is not available in this build. */
  signal: SignalServer | null;
  iceServers: { urls: string }[];
}

/** `wss://h/`, `wss://h:8443/peerjs`, `http://127.0.0.1:9000/` → server; anything else null. */
export function parseSignalUrl(text: string | null | undefined): SignalServer | null {
  if (!text) return null;
  const trimmed = text.trim();
  const match = /^(wss?|https?):\/\/([^/:?#\s]+)(?::(\d{1,5}))?(\/[^?#\s]*)?$/.exec(trimmed);
  if (!match) return null;
  const [, scheme, host, portText, pathText] = match;
  const secure = scheme === 'wss' || scheme === 'https';
  const port = portText !== undefined ? Number(portText) : secure ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!/^[A-Za-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null;
  let path = pathText ?? '/';
  if (!path.endsWith('/')) path += '/';
  if (path.includes('//')) return null;
  return { host, port, path, secure };
}

/**
 * A comma-separated list of `stun:` URLs → ICE servers; `none` → an empty list. Null when
 * the text is missing or any entry is invalid (it then counts as not set).
 */
export function parseStunUrls(text: string | null | undefined): { urls: string }[] | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (trimmed === 'none') return [];
  const urls = trimmed.split(',').map((part) => part.trim());
  for (const url of urls) {
    if (!/^stuns?:[A-Za-z0-9.-]+(:\d{1,5})?$/.test(url)) return null;
  }
  return urls.map((url) => ({ urls: url }));
}

/** The URL parameters win over the build variables; an invalid value counts as not set. */
export function netConfigFrom(env: { signal?: string; stun?: string }, search: string): NetConfig {
  const query = new URLSearchParams(search);
  const signal = parseSignalUrl(query.get('signal')) ?? parseSignalUrl(env.signal);
  const iceServers = parseStunUrls(query.get('stun')) ?? parseStunUrls(env.stun) ?? [];
  return { signal, iceServers };
}

/** The discovery list of a PeerJS server (`allow_discovery`). */
export function discoveryUrl(server: SignalServer, key: string): string {
  const scheme = server.secure ? 'https' : 'http';
  return `${scheme}://${server.host}:${server.port}${server.path}${key}/peers`;
}

/** The configuration of this page: the build's variables and the page's URL. */
export function readNetConfig(search: string): NetConfig {
  return netConfigFrom(
    { signal: import.meta.env.VITE_SIGNAL_URL, stun: import.meta.env.VITE_STUN_URLS },
    search,
  );
}
