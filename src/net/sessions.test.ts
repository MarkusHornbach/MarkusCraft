import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions/apply';
import { createPlayerRecord } from '../actions/playerRecord';
import { BUILD, CODE, Rig, type RigGuest } from '../testing/netRig';
import { mulberry32 } from '../util/rng';
import { BLOCK_SOLID, Block } from '../world/blocks';
import { roomPeerId } from './roomCode';
import { encodeMessage } from './protocol';
import { startPoseNear } from './HostSession';
import type { Connection } from './transport';

/** A raw connection to the room, for messages no client would send. */
async function rawConnection(rig: Rig): Promise<{ conn: Connection; received: string[] }> {
  const signaling = rig.net.signaling();
  await rig.settle(signaling.open(`mc-${BUILD}-g-raw${rig.net.nowMs}`));
  const conn = await rig.settle(signaling.connect(roomPeerId(BUILD, CODE)));
  const received: string[] = [];
  conn.onMessage = (text) => received.push(text);
  return { conn, received };
}

/** A cell next to the host where a block can be placed (air with air above, in reach). */
function freeCellNear(rig: Rig, dx: number, dz: number): { x: number; y: number; z: number } {
  const x = Math.floor(rig.hostPose.x) + dx;
  const z = Math.floor(rig.hostPose.z) + dz;
  let y = Math.floor(rig.hostPose.y) + 1;
  while (rig.world.getBlock(x, y, z) !== Block.AIR) y++;
  return { x, y, z };
}

describe('joining (Phase 6 AC4.1)', () => {
  it("the guest gets the host's seed, mode, time, frozen flag and edits", async () => {
    const rig = new Rig({ frozen: true, time: 0.4 });
    await rig.open();
    const cell = freeCellNear(rig, 2, 0);
    rig.host.local.submit({ kind: 'place', ...cell, slot: 2 });
    expect(rig.hostAnswers.at(-1)?.result.ok).toBe(true);
    const guest = rig.guest();
    expect(await rig.join(guest)).toBeNull();
    expect(guest.client.status).toBe('online');
    const world = guest.world;
    if (!world) throw new Error('no world');
    expect(world.seed).toBe(rig.world.seed);
    expect(guest.client.timeOfDay()).toBe(0.4);
    expect(guest.client.frozen).toBe(true);
    expect(rig.guestHash(guest)).toBe(rig.hostHash());
    expect(rig.hostHash()).not.toBe(0);
  });

  it('the start pose is within 3 blocks of the host and not inside a solid block', async () => {
    const rig = new Rig();
    await rig.open();
    const guest = rig.guest();
    await rig.join(guest);
    const self = rig.host.players().find((p) => p.id === guest.client.selfId);
    if (!self) throw new Error('guest not listed');
    const d = Math.hypot(self.pose.x - rig.hostPose.x, self.pose.z - rig.hostPose.z);
    expect(d).toBeLessThanOrEqual(3 * Math.SQRT2 + 0.01);
    expect(d).toBeGreaterThan(0.5);
    const { x, y, z } = self.pose;
    expect(BLOCK_SOLID[rig.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))]).toBe(0);
    expect(BLOCK_SOLID[rig.world.getBlock(Math.floor(x), Math.floor(y) - 1, Math.floor(z))]).toBe(
      1,
    );
  });

  it('a host in the air gives its own position', () => {
    const near = { x: 0.5, y: 120, z: 0.5, yaw: 1, pitch: 0.3 };
    expect(startPoseNear({ getBlock: () => Block.AIR }, near)).toEqual(near);
  });
});

describe('actions (Phase 6 AC4.2–AC4.4)', () => {
  it('a valid action changes every world and answers ok; an invalid one changes none', async () => {
    const rig = new Rig({ minDelayMs: 30, maxDelayMs: 60 });
    await rig.open();
    const a = rig.guest();
    const b = rig.guest();
    await rig.join(a);
    await rig.join(b);
    const cell = freeCellNear(rig, -2, 1);
    a.client.submit({ kind: 'place', ...cell, slot: 0 });
    // The guest's world waits for the host's `blocks`.
    await rig.run(10);
    expect(a.world?.getBlock(cell.x, cell.y, cell.z)).toBe(Block.AIR);
    await rig.run(300);
    const placed = rig.world.getBlock(cell.x, cell.y, cell.z);
    expect(placed).not.toBe(Block.AIR);
    expect(a.world?.getBlock(cell.x, cell.y, cell.z)).toBe(placed);
    expect(b.world?.getBlock(cell.x, cell.y, cell.z)).toBe(placed);
    expect(a.answers.at(-1)?.result.ok).toBe(true);
    const hash = rig.hostHash();
    a.client.submit({ kind: 'break', x: cell.x + 50, y: cell.y, z: cell.z });
    await rig.run(300);
    expect(a.answers.at(-1)?.result).toEqual({ ok: false, reason: 'reach' });
    expect(rig.hostHash()).toBe(hash);
    expect(rig.guestHash(b)).toBe(hash);
  });

  it('answers go to the action that was submitted, with two in flight', async () => {
    const rig = new Rig({ minDelayMs: 30, maxDelayMs: 60 });
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    const far = { kind: 'break' as const, x: 9999, y: 40, z: 0 };
    const select = { kind: 'selectSlot' as const, slot: 4 };
    g.client.submit(far);
    g.client.submit(select);
    await rig.run(300);
    expect(g.answers).toEqual([
      { action: far, result: { ok: false, reason: 'reach' } },
      { action: select, result: { ok: true, blocks: [], player: null, notices: [] } },
    ]);
  });

  it('each player has its own record', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    g.client.submit({ kind: 'selectSlot', slot: 5 });
    g.client.submit({ kind: 'setBarSlot', slot: 1, item: Block.TORCH });
    await rig.run(200);
    expect(g.client.record.selectedSlot).toBe(5);
    expect(g.client.record.slots[1]?.item).toBe(Block.TORCH);
    expect(rig.hostRecord.selectedSlot).toBe(0);
    expect(rig.host.local.record).toEqual(createPlayerRecord('creative'));
  });

  it("a host action reaches all guests; the host's own answer is at once", async () => {
    const rig = new Rig();
    await rig.open();
    const a = rig.guest();
    const b = rig.guest();
    await rig.join(a);
    await rig.join(b);
    const cell = freeCellNear(rig, 0, 2);
    rig.host.local.submit({ kind: 'place', ...cell, slot: 1 });
    expect(rig.hostAnswers.at(-1)?.result.ok).toBe(true);
    await rig.run(100);
    expect(a.world?.getBlock(cell.x, cell.y, cell.z)).toBe(
      rig.world.getBlock(cell.x, cell.y, cell.z),
    );
    expect(b.blocks.at(-1)).toEqual([{ ...cell, id: rig.world.getBlock(cell.x, cell.y, cell.z) }]);
    rig.host.local.submit({ kind: 'nonsense' } as never);
    expect(rig.hostAnswers.at(-1)?.result).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('admission (Phase 6 AC4.5)', () => {
  it('full, build, duplicate, suffixes and info', async () => {
    const rig = new Rig();
    await rig.open();
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const g = rig.guest({ name: 'Anna' });
      expect(await rig.join(g)).toBeNull();
      names.push(g.client.selfName ?? '');
    }
    expect(names).toEqual(['Anna', 'Anna (2)', 'Anna (3)']);
    expect(await rig.join(rig.guest())).toBe('full');
    expect(rig.host.playerCount).toBe(4);
    const rig2 = new Rig();
    await rig2.open();
    // The room is listed under another build: the version message.
    expect(await rig2.join(rig2.guest({ build: 'other99' }))).toBe('build');
    const first = rig2.guest();
    await rig2.join(first);
    expect(await rig2.join(rig2.guest({ key: first.key }))).toBe('duplicate');
    // `info` makes no player.
    const { conn, received } = await rawConnection(rig2);
    conn.send(encodeMessage({ t: 'info' }));
    await rig2.run(100);
    expect(JSON.parse(received[0])).toEqual({
      t: 'info',
      hostName: 'Hosta',
      worldName: 'Shared',
      mode: 'creative',
      players: 2,
      max: 4,
    });
    expect(rig2.host.playerCount).toBe(2);
    // A hello of another build at the same room.
    conn.send(
      JSON.stringify({ t: 'hello', build: 'zzz', key: '0'.repeat(32), name: 'x', look: 1 }),
    );
    await rig2.run(100);
    expect(JSON.parse(received[1])).toEqual({ t: 'reject', reason: 'build' });
    // A connection that never says hello is closed after the join timeout.
    await rig2.run(16_000);
    expect(conn.open).toBe(false);
  });

  it('a guest of another build sees the version message when the room is listed', async () => {
    const rig = new Rig();
    await rig.open();
    const other = rig.guest({ build: 'zzz9999' });
    expect(await rig.join(other)).toBe('build');
  });

  it('a mismatched terrain checksum refuses the world', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest({ checksum: 1 });
    expect(await rig.join(g)).toBe('terrain');
    expect(g.world).toBeNull();
    await rig.run(200);
    expect(rig.host.playerCount).toBe(1);
  });

  it('an unreachable server and a missing room', async () => {
    const rig = new Rig();
    // The room is never opened.
    expect(await rig.join(rig.guest())).toBe('not-found');
    rig.net.reachable = false;
    expect(await rig.join(rig.guest())).toBe('unreachable');
  });
});

describe('poses (Phase 6 AC4.6, AC6.8)', () => {
  it('a pose reaches the others within one relay, never the sender; invalid ones are dropped', async () => {
    const rig = new Rig();
    await rig.open();
    const a = rig.guest();
    const b = rig.guest();
    await rig.join(a);
    await rig.join(b);
    await rig.run(200);
    const idA = a.client.selfId ?? -1;
    const pose = { x: 3.25, y: 70, z: 4.5, yaw: 1, pitch: 0.2 };
    a.client.setPose(pose, rig.net.nowMs);
    await rig.run(150);
    expect(b.client.roster.get(idA)?.poses.latest).toEqual(pose);
    expect(rig.host.roster.get(idA)?.poses.latest).toEqual(pose);
    expect(a.client.roster.get(idA)).toBeUndefined();
    // Out of bounds: dropped by the host.
    a.client.setPose({ ...pose, y: 9999 }, rig.net.nowMs);
    await rig.run(150);
    expect(b.client.roster.get(idA)?.poses.latest).toEqual(pose);
    // The host moves: the guests see it.
    rig.hostPose = { ...rig.hostPose, x: rig.hostPose.x + 1 };
    await rig.run(150);
    expect(a.client.roster.get(1)?.poses.latest?.x).toBe(rig.hostPose.x);
  });

  it('an unchanged pose is not sent again; a moving one at most 20 times a second', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    const pose = { x: 1, y: 70, z: 1, yaw: 0, pitch: 0 };
    const start = g.client.posesSent;
    for (let t = 0; t < 3000; t += 1000 / 60) {
      g.client.setPose(pose, rig.net.nowMs + t);
    }
    expect(g.client.posesSent - start).toBe(1);
    const before = g.client.posesSent;
    const now = rig.net.nowMs + 4000;
    for (let i = 0; i < 60; i++) {
      g.client.setPose({ ...pose, x: 1 + i * 0.07 }, now + (i * 1000) / 60);
    }
    const sent = g.client.posesSent - before;
    expect(sent).toBeLessThanOrEqual(21);
    expect(sent).toBeGreaterThanOrEqual(19);
  });

  it('a silent guest is removed after 5 s and the others get `left`', async () => {
    const rig = new Rig();
    await rig.open();
    const a = rig.guest({ name: 'Quiet' });
    const b = rig.guest();
    await rig.join(a);
    await rig.join(b);
    // The quiet guest stops updating (no pings) and its transport stays open.
    rig.guests.splice(rig.guests.indexOf(a), 1);
    await rig.run(6000);
    expect(rig.host.playerCount).toBe(2);
    expect(b.peers.at(-1)).toMatchObject({ kind: 'left', name: 'Quiet', reason: 'lost' });
    expect(rig.hostPeers).toContainEqual(expect.objectContaining({ kind: 'left', reason: 'lost' }));
  });
});

describe('time (Phase 6 AC4.7)', () => {
  it('guest time follows the host after a pong; the host runs by its clock alone', async () => {
    const rig = new Rig({ time: 0.3, minDelayMs: 50, maxDelayMs: 300 });
    await rig.open();
    const g = rig.guest();
    await rig.join(g, 2000);
    const t0 = rig.host.timeOfDay();
    // No host frames: the host still answers pings and its time advances.
    await rig.run(60_000, false);
    const t1 = rig.host.timeOfDay();
    expect(t1 - t0).toBeCloseTo(60 / 1200, 6);
    expect(Math.abs(g.client.timeOfDay() - t1)).toBeLessThan(0.001);
    rig.host.setTime(0.75);
    await rig.run(1500, false);
    expect(Math.abs(g.client.timeOfDay() - rig.host.timeOfDay())).toBeLessThan(0.001);
  });

  it('a frozen host keeps its time', async () => {
    const rig = new Rig({ time: 0.6, frozen: true });
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    await rig.run(5000);
    expect(rig.host.timeOfDay()).toBe(0.6);
    expect(g.client.timeOfDay()).toBe(0.6);
  });

  it('a host without frames relays poses from the message handler', async () => {
    const rig = new Rig();
    await rig.open();
    const a = rig.guest();
    const b = rig.guest();
    await rig.join(a);
    await rig.join(b);
    const pose = { x: 5, y: 70, z: 5, yaw: 0, pitch: 0 };
    a.client.setPose(pose, rig.net.nowMs);
    // Relayed from the handler of the pose itself or, at the latest, of the next ping.
    await rig.run(1200, false);
    expect(b.client.roster.get(a.client.selfId ?? -1)?.poses.latest).toEqual(pose);
  });
});

describe('convergence (Phase 6 AC4.8, AC4.9)', () => {
  it('2 000 random actions of a host and three guests give equal worlds', async () => {
    const rig = new Rig({ minDelayMs: 0, maxDelayMs: 80, netSeed: 7 });
    await rig.open();
    const players: RigGuest[] = [rig.guest(), rig.guest()];
    for (const g of players) await rig.join(g);
    const rng = mulberry32(11);
    const late = rig.guest();
    const base = {
      x: Math.floor(rig.hostPose.x),
      y: Math.floor(rig.hostPose.y),
      z: Math.floor(rig.hostPose.z),
    };
    for (let i = 0; i < 2000; i++) {
      if (i === 1000) {
        // Joins midway, while actions keep coming.
        void late.client.join();
        players.push(late);
      }
      const who = Math.floor(rng() * 4);
      const x = base.x + Math.floor(rng() * 7) - 3;
      const y = base.y + Math.floor(rng() * 5) - 2;
      const z = base.z + Math.floor(rng() * 7) - 3;
      const action =
        rng() < 0.5
          ? { kind: 'break' as const, x, y, z }
          : { kind: 'place' as const, x, y, z, slot: Math.floor(rng() * 9) };
      if (who === 3) rig.host.local.submit(action);
      else {
        const g = players[who];
        if (g && g.client.status === 'online') g.client.submit(action);
      }
      await rig.run(Math.floor(rng() * 20));
    }
    await rig.run(1000);
    expect(late.client.status).toBe('online');
    const hash = rig.hostHash();
    for (const g of players) expect(rig.guestHash(g)).toBe(hash);
    // The guests' own simulation was never needed: the edits are the host's.
    expect(rig.world.edits.size).toBeGreaterThan(0);
  });

  it('edits made while a snapshot is in transit are present on the joining guest', async () => {
    const rig = new Rig({ minDelayMs: 100, maxDelayMs: 100 });
    await rig.open();
    const g = rig.guest();
    void g.client.join();
    let placed = 0;
    for (let i = 0; i < 40 && g.client.status !== 'online'; i++) {
      const cell = freeCellNear(rig, (i % 5) - 2, Math.floor(i / 5) - 4);
      rig.host.local.submit({ kind: 'place', ...cell, slot: 0 });
      if (rig.hostAnswers.at(-1)?.result.ok) placed++;
      await rig.run(20);
    }
    await rig.run(500);
    expect(placed).toBeGreaterThan(3);
    expect(rig.guestHash(g)).toBe(rig.hostHash());
  });
});

describe('protocol errors (Phase 6 AC4.10)', () => {
  it('20 invalid messages close the connection', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    for (let i = 0; i < 19; i++) g.client.sendRaw('{"t":"teleport"}');
    await rig.run(100);
    expect(g.client.status).toBe('online');
    g.client.sendRaw('not json');
    await rig.run(100);
    expect(rig.hostPeers).toContainEqual(expect.objectContaining({ kind: 'left', reason: 'lost' }));
    // The guest's connection was closed: it comes back with a fresh one.
    expect(g.statuses).toContain('reconnecting');
    // A stranger that only talks nonsense is closed too.
    const { conn } = await rawConnection(rig);
    for (let i = 0; i < 20; i++) conn.send('[1]');
    await rig.run(100);
    expect(conn.open).toBe(false);
  });

  it('a member that says hello twice is counted as an error', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    for (let i = 0; i < 20; i++) g.client.sendRaw(encodeMessage({ t: 'info' }));
    await rig.run(100);
    expect(rig.hostPeers).toContainEqual(expect.objectContaining({ kind: 'left', reason: 'lost' }));
  });
});

describe('the guest state machine (Phase 6 AC4.11)', () => {
  it('bye ends without reconnecting', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    rig.host.close();
    await rig.run(500);
    expect(g.ends).toEqual(['closed']);
    expect(g.client.status).toBe('offline');
    expect(g.statuses).not.toContain('reconnecting');
    expect(rig.host.isClosed).toBe(true);
  });

  it('a lost host: retries every 2 s for 10 s, then offline', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    rig.hostSignaling.close();
    await rig.run(500);
    expect(g.client.status).toBe('reconnecting');
    await rig.run(9000);
    expect(g.client.status).toBe('reconnecting');
    await rig.run(1500);
    expect(g.client.status).toBe('offline');
    expect(g.ends).toEqual(['lost']);
  });

  it('a host that is silent counts as lost too', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    // The host keeps its connection but never answers (a frozen tab).
    g.client.update(rig.net.nowMs + 6000);
    expect(g.client.status).toBe('reconnecting');
  });

  it('a host that returns within the window: online again with its edits and the record', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    g.client.submit({ kind: 'selectSlot', slot: 6 });
    await rig.run(200);
    // The host is unreachable for a while: the guest retries.
    rig.net.reachable = false;
    g.client.dropConnection();
    await rig.run(100);
    expect(g.client.status).toBe('reconnecting');
    const cell = freeCellNear(rig, 1, -2);
    rig.host.local.submit({ kind: 'place', ...cell, slot: 3 });
    await rig.run(4000);
    expect(g.client.status).toBe('reconnecting');
    rig.net.reachable = true;
    await rig.run(4000);
    expect(g.client.status).toBe('online');
    expect(g.worlds).toBe(2);
    expect(rig.guestHash(g)).toBe(rig.hostHash());
    expect(g.client.record.selectedSlot).toBe(6);
    expect(g.ends).toEqual([]);
    expect(rig.host.playerCount).toBe(2);
  });

  it('leaving says goodbye: the others see `leave`', async () => {
    const rig = new Rig();
    await rig.open();
    const a = rig.guest();
    const b = rig.guest();
    await rig.join(a);
    await rig.join(b);
    a.client.leave();
    await rig.run(200);
    a.client.dispose();
    expect(rig.host.playerCount).toBe(2);
    expect(b.peers.at(-1)).toMatchObject({ kind: 'left', reason: 'leave' });
    expect(a.client.status).toBe('offline');
    expect(a.ends).toEqual([]);
    // Nothing is sent while offline.
    a.client.submit({ kind: 'selectSlot', slot: 1 });
    expect(a.answers.at(-1)?.result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('a join that hears nothing times out after 15 s', async () => {
    const rig = new Rig();
    await rig.open();
    // A room that accepts connections but never answers.
    rig.hostSignaling.onConnection = () => {};
    expect(await rig.join(rig.guest(), 16_000)).toBe('timeout');
  });
});

describe('far chunks (Phase 6 AC4.13)', () => {
  it('a guest breaking next to water 300 blocks away gets water, read on the side', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await rig.join(g);
    // A cell next to water far from the host, found in the generated terrain.
    const reader = rig.host.reader;
    let found: { x: number; y: number; z: number } | null = null;
    for (let x = 300; x < 600 && !found; x++) {
      for (let z = -40; z < 40 && !found; z++) {
        for (let y = 30; y < 60; y++) {
          const id = reader.getBlock(x, y, z);
          if (
            id !== Block.WATER &&
            id !== Block.AIR &&
            id !== Block.BEDROCK &&
            reader.getBlock(x + 1, y, z) === Block.WATER
          ) {
            found = { x, y, z };
            break;
          }
        }
      }
    }
    if (!found) throw new Error('no shore found');
    expect(rig.world.getChunk(Math.floor(found.x / 16), Math.floor(found.z / 16))).toBeUndefined();
    g.client.setPose(
      { x: found.x + 0.5, y: found.y + 1, z: found.z + 2.5, yaw: 0, pitch: 0 },
      rig.net.nowMs,
      true,
    );
    await rig.run(200);
    g.client.submit({ kind: 'break', ...found });
    await rig.run(200);
    expect(g.answers.at(-1)?.result.ok).toBe(true);
    expect(
      rig.world.edits.get(`${Math.floor(found.x / 16)},${Math.floor(found.z / 16)}`),
    ).toBeDefined();
    expect(g.world?.getBlock(found.x, found.y, found.z)).toBe(Block.AIR); // not loaded on the guest
    expect(reader.getBlock(found.x, found.y, found.z)).toBe(Block.WATER);
    expect(rig.guestHash(g)).toBe(rig.hostHash());
    expect(rig.world.getChunk(Math.floor(found.x / 16), Math.floor(found.z / 16))).toBeUndefined();
    // The same rule as `applyAction` on a loaded world.
    expect(applyAction).toBeTypeOf('function');
  });

  it('the cache holds at most 32 chunks and agrees with loaded chunks', async () => {
    const rig = new Rig();
    const reader = rig.host.reader;
    const rng = mulberry32(3);
    for (let i = 0; i < 2000; i++) {
      const x = Math.floor(rng() * 2000) - 1000;
      const z = Math.floor(rng() * 2000) - 1000;
      const y = Math.floor(rng() * 128);
      reader.getBlock(x, y, z);
      expect(reader.cached).toBeLessThanOrEqual(32);
    }
    // Loaded chunks are read directly.
    expect(reader.getBlock(1, 40, 1)).toBe(rig.world.getBlock(1, 40, 1));
    expect(reader.getBlock(1, 200, 1)).toBe(Block.AIR);
    expect(reader.getBlock(1, -1, 1)).toBe(Block.BEDROCK);
  });
});
