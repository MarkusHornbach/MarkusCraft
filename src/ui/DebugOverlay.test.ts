import { describe, expect, it } from 'vitest';
import { chestsRow, netRows } from './DebugOverlay';

describe('the network lines of the debug overlay (Phase 6 AC14.1)', () => {
  const rates = { inMsgs: 41.5, outMsgs: 60, inBytes: 2150, outBytes: 5120 };

  it('names role, code, players, round trip, link, signaling and traffic', () => {
    expect(
      netRows({
        role: 'guest',
        status: 'online',
        roomCode: 'ABCDEF',
        players: 3,
        rtt: [{ name: 'host', rttMs: 12.4 }],
        links: ['direct (host → host)'],
        signal: 'open',
        rates,
      }),
    ).toEqual({
      room: 'guest, online, code ABCDEF, 3 players',
      roundTrip: '12 ms',
      link: 'direct (host → host)',
      signal: 'open',
      traffic: 'in 42 msg/s 2.1 kB/s, out 60 msg/s 5.0 kB/s',
    });
    const host = netRows({
      role: 'host',
      status: 'online',
      roomCode: 'ABCDEF',
      players: 1,
      rtt: [],
      links: [],
      signal: 'open',
      rates,
    });
    expect(host.room).toBe('host, online, code ABCDEF, 1 player');
    expect(host.roundTrip).toBe('no guests');
    expect(host.link).toBe('–');
    expect(
      netRows({
        role: 'host',
        status: 'online',
        roomCode: null,
        players: 3,
        rtt: [
          { name: 'Anna', rttMs: 8 },
          { name: 'Ben', rttMs: null },
        ],
        links: ['direct (host → host)', 'direct (host → host)', 'via STUN (srflx → host)'],
        signal: 'lost',
        rates,
      }),
    ).toMatchObject({
      room: 'host, online, code –, 3 players',
      roundTrip: 'Anna 8 ms, Ben –',
      link: 'direct (host → host), via STUN (srflx → host)',
    });
    expect(netRows(null).room).toBe('off');
  });
});

describe('the chests row of the debug overlay (Phase 8B3a 6.6)', () => {
  it('names the chests with items, the size of all states and dropped states', () => {
    expect(chestsRow(3, 1229, 0)).toBe('3 chests · 1.2 kB');
    expect(chestsRow(1, 120, 0)).toBe('1 chest · 120 B');
    expect(chestsRow(0, 40, 2)).toBe('0 chests · 40 B · 2 dropped');
  });
});
