import { describe, expect, it } from 'vitest';
import { discoveryUrl, netConfigFrom, parseSignalUrl, parseStunUrls } from './netConfig';

describe('netConfig', () => {
  it('Phase 6 AC1.1: parses signaling URLs into host, port, path and TLS', () => {
    expect(parseSignalUrl('wss://h/')).toEqual({ host: 'h', port: 443, path: '/', secure: true });
    expect(parseSignalUrl('wss://h:8443/peerjs')).toEqual({
      host: 'h',
      port: 8443,
      path: '/peerjs/',
      secure: true,
    });
    expect(parseSignalUrl('http://127.0.0.1:9000/')).toEqual({
      host: '127.0.0.1',
      port: 9000,
      path: '/',
      secure: false,
    });
    expect(parseSignalUrl(' ws://a.b ')).toEqual({
      host: 'a.b',
      port: 80,
      path: '/',
      secure: false,
    });
    expect(parseSignalUrl('https://a.b/x/')?.path).toBe('/x/');
    for (const bad of [
      '',
      null,
      undefined,
      'h',
      'ftp://h/',
      'wss://',
      'wss://h:0/',
      'wss://h:99999/',
      'wss://h/a//b',
      'wss://.h/',
      'wss://h_x/',
      'wss://h/?q=1',
      'wss://user@h/',
    ]) {
      expect(parseSignalUrl(bad)).toBeNull();
    }
  });

  it('Phase 6 AC1.1: parses lists of STUN URLs and none', () => {
    expect(parseStunUrls('stun:a:3478')).toEqual([{ urls: 'stun:a:3478' }]);
    expect(parseStunUrls('stun:a:3478, stun:b')).toEqual([
      { urls: 'stun:a:3478' },
      { urls: 'stun:b' },
    ]);
    expect(parseStunUrls('none')).toEqual([]);
    for (const bad of [null, undefined, '', ' ', 'turn:a', 'stun:a,', 'stun:a b', 'http://a']) {
      expect(parseStunUrls(bad)).toBeNull();
    }
  });

  it('Phase 6 AC1.1: URL parameters win; invalid values count as not set', () => {
    const env = { signal: 'wss://build.example/', stun: 'stun:build.example:3478' };
    expect(netConfigFrom(env, '')).toEqual({
      signal: { host: 'build.example', port: 443, path: '/', secure: true },
      iceServers: [{ urls: 'stun:build.example:3478' }],
    });
    expect(netConfigFrom(env, '?signal=http://127.0.0.1:9000/&stun=none')).toEqual({
      signal: { host: '127.0.0.1', port: 9000, path: '/', secure: false },
      iceServers: [],
    });
    // An invalid parameter falls back to the build variable.
    expect(netConfigFrom(env, '?signal=nonsense&stun=bad').signal?.host).toBe('build.example');
    expect(netConfigFrom(env, '?stun=bad').iceServers).toHaveLength(1);
    expect(netConfigFrom({}, '')).toEqual({ signal: null, iceServers: [] });
    expect(netConfigFrom({ signal: 'bad' }, '?stun=stun:x').iceServers).toEqual([
      { urls: 'stun:x' },
    ]);
  });

  it('builds the discovery URL of a server', () => {
    const local = parseSignalUrl('http://127.0.0.1:9000/');
    const pi = parseSignalUrl('wss://h:8443/peerjs');
    if (!local || !pi) throw new Error('parse failed');
    expect(discoveryUrl(local, 'peerjs')).toBe('http://127.0.0.1:9000/peerjs/peers');
    expect(discoveryUrl(pi, 'peerjs')).toBe('https://h:8443/peerjs/peerjs/peers');
  });
});
