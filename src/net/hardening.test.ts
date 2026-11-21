import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { expectFasterThan } from '../testing/timing';
import { Rig } from '../testing/netRig';
import { TRAFFIC_WINDOW_MS, TrafficMeter, countedNetwork } from './traffic';
import { MemoryNetwork } from './memoryTransport';
import type { Connection } from './transport';
import { linkKind } from './netTest';

/** A rig with three joined guests, all four players next to the start point. */
async function fourPlayers(options: { minDelayMs?: number; maxDelayMs?: number } = {}) {
  const rig = new Rig({ minDelayMs: options.minDelayMs ?? 0, maxDelayMs: options.maxDelayMs ?? 0 });
  // Lit around every edit, as the game's chunks are (an edit next to a chunk that is not
  // lit lights it afresh).
  for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) rig.world.generate(cx, cz);
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) rig.world.light(cx, cz);
  await rig.open();
  for (let i = 0; i < 3; i++) expect(await rig.join(rig.guest())).toBeNull();
  return rig;
}

/** The pose of player `i` (0 the host) walking a circle at time `t` (ms). */
function circlePose(base: { x: number; y: number; z: number }, i: number, t: number) {
  const a = t / 1000 + (i * Math.PI) / 2;
  return {
    x: base.x + Math.cos(a) * (1.5 + i),
    y: base.y,
    z: base.z + Math.sin(a) * (1.5 + i),
    yaw: a,
    pitch: 0.1 * i,
  };
}

describe('the host under load (Phase 6 AC14.5)', () => {
  it('Phase 6 AC14.5: one action is validated and applied in less than 0.2 ms on average', async () => {
    const rig = await fourPlayers();
    const spawn = { ...rig.hostPose };
    const cells: { x: number; y: number; z: number }[] = [];
    // Air cells over the ground around the host, within reach.
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
        const x = Math.floor(spawn.x) + dx;
        const z = Math.floor(spawn.z) + dz;
        for (let y = Math.floor(spawn.y) + 3; y > spawn.y - 3; y--) {
          if (rig.world.getBlock(x, y, z) === 0 && rig.world.getBlock(x, y - 1, z) !== 0) {
            cells.push({ x, y, z });
            break;
          }
        }
      }
    }
    expect(cells.length).toBeGreaterThan(20);
    const run = (count: number): number => {
      let ms = 0;
      for (let i = 0; i < count; i++) {
        const cell = cells[(i >> 1) % cells.length];
        const start = performance.now();
        rig.host.local.submit(
          i % 2 === 0 ? { kind: 'place', ...cell, slot: 0 } : { kind: 'break', ...cell },
        );
        ms += performance.now() - start;
        // The guests get the changes now and then (not measured).
        if (i % 100 === 99) rig.net.advance(0);
      }
      return ms;
    };
    run(1000);
    const before = rig.hostAnswers.length;
    let best = Infinity;
    for (let round = 0; round < 3; round++) best = Math.min(best, run(10_000) / 10_000);
    const answers = rig.hostAnswers.slice(before);
    expect(answers.length).toBe(30_000);
    expect(answers.every((a) => a.result.ok)).toBe(true);
    console.log(`AC14.5: ${(best * 1000).toFixed(1)} µs per action`);
    expectFasterThan(best, 0.2);
    // The guests got every change and end with the host's world.
    await rig.run(200);
    for (const guest of rig.guests) expect(rig.guestHash(guest)).toBe(rig.hostHash());
    expect(rig.world.verifyLight()).toBe(0);
  });

  it('Phase 6 AC14.5: one relay of four moving players takes less than 1 ms', async () => {
    const rig = await fourPlayers();
    const base = { ...rig.hostPose };
    const t0 = Math.ceil(rig.net.nowMs / 50) * 50 + 100;
    let total = 0;
    let rounds = 0;
    let relays = 0;
    for (let round = 0; round < 400; round++) {
      const t = t0 + round * 50;
      // The poses arrive right after a relay, so the next one runs in `update`.
      rig.net.advance(t - rig.net.nowMs);
      const pending = rig.net.pending;
      const start = performance.now();
      rig.host.update(t);
      const ms = performance.now() - start;
      relays += rig.net.pending - pending;
      if (round >= 100) {
        total += ms;
        rounds++;
      }
      rig.net.advance(0);
      rig.hostPose = circlePose(base, 0, t + 50);
      rig.guests.forEach((g, i) => g.client.setPose(circlePose(base, i + 1, t + 50), t));
      rig.net.advance(0);
    }
    // Every relay sends one `poses` to each of the three guests.
    expect(relays).toBeGreaterThanOrEqual(399 * 3);
    const average = total / rounds;
    console.log(`AC14.5: ${(average * 1000).toFixed(1)} µs per relay of four players`);
    expectFasterThan(average, 1);
    for (const guest of rig.guests) {
      // Each guest knows the three others at their newest poses.
      expect(guest.client.roster.list().length).toBe(3);
    }
  });
});

describe('the traffic of a room (Phase 6 AC14.6)', () => {
  it('Phase 6 AC14.6: with four moving players the host sends less than 20 kB per second', async () => {
    const rig = new Rig({ minDelayMs: 5, maxDelayMs: 20 });
    // Count everything the host's connections send.
    const meter = new TrafficMeter(() => rig.net.nowMs);
    const counted = countedNetwork(
      { signaling: () => rig.net.signaling(), directory: rig.net.directory() },
      meter,
    );
    const hostSignaling = counted.signaling();
    hostSignaling.onConnection = (conn) => rig.host.accept(conn);
    await rig.settle(hostSignaling.open('mc-test123-r-ABCDEF'));
    for (let i = 0; i < 3; i++) expect(await rig.join(rig.guest())).toBeNull();
    await rig.run(500);
    const base = { ...rig.hostPose };
    const sentBefore = meter.outBytes;
    const msgsBefore = meter.outMsgs;
    const start = rig.net.nowMs;
    // Ten seconds of four players walking; every guest also edits twice a second.
    for (let step = 0; step < 600; step++) {
      const t = rig.net.nowMs;
      rig.hostPose = circlePose(base, 0, t);
      rig.guests.forEach((g, i) => {
        g.client.setPose(circlePose(base, i + 1, t), t);
        if (step % 30 === i * 10) {
          // A cell above the host's head, within reach of every guest's circle.
          const p = base;
          const cell = { x: Math.floor(p.x) + i - 1, y: Math.floor(p.y) + 3, z: Math.floor(p.z) };
          g.client.submit(
            step % 60 < 30 ? { kind: 'place', ...cell, slot: 0 } : { kind: 'break', ...cell },
          );
        }
      });
      await rig.run(10);
      await rig.run(7, true);
    }
    const seconds = (rig.net.nowMs - start) / 1000;
    const bytesPerS = (meter.outBytes - sentBefore) / seconds;
    const msgsPerS = (meter.outMsgs - msgsBefore) / seconds;
    console.log(
      `AC14.6: host sends ${(bytesPerS / 1024).toFixed(2)} kB/s in ${msgsPerS.toFixed(0)} messages/s`,
    );
    expect(bytesPerS).toBeLessThan(20 * 1024);
    // The poses really moved: every guest saw the others walk.
    for (const guest of rig.guests) expect(guest.client.roster.list().length).toBe(3);
    const refused = rig.guests.flatMap((g) => g.answers.filter((a) => !a.result.ok));
    expect(refused).toEqual([]);
  });
});

describe('the traffic meter', () => {
  it('counts messages both ways and gives rates over the window', async () => {
    const net = new MemoryNetwork();
    const meter = new TrafficMeter(() => net.nowMs);
    const counted = countedNetwork(
      { signaling: () => net.signaling(), directory: net.directory() },
      meter,
    );
    const a = counted.signaling();
    const b = net.signaling();
    const got: string[] = [];
    let accepted: Connection | null = null;
    b.onConnection = (conn) => {
      accepted = conn;
      conn.onMessage = (text) => conn.send(text.toUpperCase());
    };
    const opened = Promise.all([a.open('a'), b.open('b')]);
    net.advance(0);
    await opened;
    const connecting = a.connect('b');
    net.advance(0);
    const conn = await connecting;
    expect(accepted).not.toBeNull();
    conn.onMessage = (text) => got.push(text);
    expect(meter.connections()).toEqual([conn]);
    for (let i = 0; i < 10; i++) {
      conn.send('hello');
      net.advance(100);
    }
    expect(got.length).toBe(10);
    expect(got[0]).toBe('HELLO');
    expect([meter.inMsgs, meter.outMsgs, meter.inBytes, meter.outBytes]).toEqual([10, 10, 50, 50]);
    // The window holds the last two seconds: at most 20 messages, here all 10 each way.
    const rates = meter.rates();
    expect(rates.outMsgs).toBe(10 / (TRAFFIC_WINDOW_MS / 1000));
    expect(rates.inBytes).toBe(50 / (TRAFFIC_WINDOW_MS / 1000));
    net.advance(TRAFFIC_WINDOW_MS);
    expect(meter.rates()).toEqual({ inMsgs: 0, outMsgs: 0, inBytes: 0, outBytes: 0 });
    expect(a.id).toBe('a');
    expect(a.state).toBe('open');
    conn.close();
    expect(meter.connections()).toEqual([]);
    conn.send('lost');
    expect(meter.outMsgs).toBe(10);
  });

  it('counts the connections another peer opens, and forgets them when the other end closes', async () => {
    const net = new MemoryNetwork();
    const meter = new TrafficMeter(() => net.nowMs);
    const counted = countedNetwork(
      { signaling: () => net.signaling(), directory: net.directory() },
      meter,
    );
    const host = counted.signaling();
    const guest = net.signaling();
    const states: string[] = [];
    host.onStateChange = (s) => states.push(s);
    let accepted: Connection | null = null;
    host.onConnection = (conn) => {
      accepted = conn;
    };
    const opened = Promise.all([host.open('h'), guest.open('g')]);
    net.advance(0);
    await opened;
    const connecting = guest.connect('h');
    net.advance(0);
    const conn = await connecting;
    const inbound = accepted as Connection | null;
    if (!inbound) throw new Error('no connection');
    let closed = false;
    inbound.onClose = () => {
      closed = true;
    };
    expect(inbound.remoteId).toBe('g');
    expect(inbound.bufferedAmount()).toBe(0);
    expect(await inbound.stats()).toBeNull();
    conn.send('x');
    net.advance(0);
    expect(meter.inMsgs).toBe(1);
    conn.close();
    net.advance(0);
    expect(closed).toBe(true);
    expect(meter.connections()).toEqual([]);
    (host as unknown as { close(): void }).close();
    expect(host.state).toBe('off');
    expect(states).toEqual([]);
  });
});

describe('the link of a connection (Phase 6 AC14.1)', () => {
  it('calls a pair direct, via STUN or relayed', () => {
    const pair = (localType: string, remoteType: string) => ({
      localType,
      remoteType,
      remoteMdns: false,
      remoteAddress: '192.168.*.*',
    });
    expect(linkKind(pair('host', 'host'))).toBe('direct (host → host)');
    expect(linkKind(pair('srflx', 'host'))).toBe('via STUN (srflx → host)');
    expect(linkKind(pair('host', 'prflx'))).toBe('via STUN (host → prflx)');
    expect(linkKind(pair('relay', 'srflx'))).toBe('relay (relay → srflx)');
  });
});

describe('round trips on the host', () => {
  it('the host keeps the round trip each guest reports with its ping', async () => {
    const rig = await fourPlayers({ minDelayMs: 10, maxDelayMs: 10 });
    expect(rig.host.roundTrips().map((r) => r.rttMs)).toEqual([null, null, null]);
    await rig.run(2500);
    const trips = rig.host.roundTrips();
    expect(trips.map((r) => r.id)).toEqual([2, 3, 4]);
    // A ping and its pong take 10 ms each way; frames come every 10 ms.
    for (const trip of trips) {
      expect(trip.rttMs).not.toBeNull();
      expect(trip.rttMs ?? 0).toBeGreaterThanOrEqual(20);
      expect(trip.rttMs ?? 0).toBeLessThanOrEqual(40);
    }
    for (const guest of rig.guests) expect(guest.client.signalState).toBe('open');
  });
});
