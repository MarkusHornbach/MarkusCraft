// Phase 6 part D: looks, `profile` and the pose flags over the memory transport.
import { describe, expect, it } from 'vitest';
import { ACTION_RATE_LIMIT, POSE_SEND_HZ } from '../game/config';
import { Rig, type RigGuest } from '../testing/netRig';
import { Block } from '../world/blocks';

/** One relay interval plus the transport's largest delay, twice over. */
const RELAY_MS = 2 * (1000 / POSE_SEND_HZ + 20);

async function room(...looks: number[]): Promise<{ rig: Rig; guests: RigGuest[] }> {
  const rig = new Rig();
  await rig.open();
  const guests: RigGuest[] = [];
  for (const [i, look] of looks.entries()) {
    const guest = rig.guest({ name: `G${i + 1}`, look });
    expect(await rig.join(guest)).toBeNull();
    guests.push(guest);
  }
  return { rig, guests };
}

function lookOf(guest: RigGuest, id: number | null): number | undefined {
  return id === null ? undefined : guest.client.roster.get(id)?.look;
}

describe('looks and profiles (Phase 6 AC12.2)', () => {
  it("every player's look reaches everyone in welcome and joined", async () => {
    const { rig, guests } = await room(3, 6, 8);
    const [a, b, c] = guests;
    const ids = guests.map((g) => g.client.selfId);
    // The host knows each guest's look.
    expect(guests.map((g) => rig.host.roster.get(g.client.selfId ?? -1)?.look)).toEqual([3, 6, 8]);
    expect(rig.host.players().map((p) => p.look)).toEqual([4, 3, 6, 8]);
    // The first guest learnt the others from `joined`, the last from `welcome`.
    expect([lookOf(a, 1), lookOf(a, ids[1]), lookOf(a, ids[2])]).toEqual([4, 6, 8]);
    expect([lookOf(c, 1), lookOf(c, ids[0]), lookOf(c, ids[1])]).toEqual([4, 3, 6]);
    expect(lookOf(b, ids[2])).toBe(8);
    expect(a.client.selfLook).toBe(3);
  });

  it("a guest's profile reaches the host and all others within one relay", async () => {
    const { rig, guests } = await room(1, 2, 3);
    const [a, b, c] = guests;
    const id = a.client.selfId;
    a.client.setProfile('Anna', 5);
    await rig.run(RELAY_MS);
    expect(rig.host.roster.get(id ?? -1)).toMatchObject({ name: 'Anna', look: 5 });
    expect(rig.host.players().find((p) => p.id === id)).toMatchObject({ name: 'Anna', look: 5 });
    for (const other of [b, c]) {
      expect(other.client.roster.get(id ?? -1)).toMatchObject({ name: 'Anna', look: 5 });
    }
    expect(a.client.selfName).toBe('Anna');
    expect(rig.hostPeers.at(-1)).toEqual({ kind: 'profile', id, name: 'Anna', look: 5 });
  });

  it("the host's own profile change reaches every guest", async () => {
    const { rig, guests } = await room(1, 2);
    rig.host.setHostProfile('Boss', 7);
    await rig.run(RELAY_MS);
    for (const guest of guests) {
      expect(guest.client.roster.get(1)).toMatchObject({ name: 'Boss', look: 7 });
    }
    expect(rig.host.players()[0]).toMatchObject({ name: 'Boss', look: 7 });
  });

  it('a name taken in the room gets its suffix again; the sender learns it', async () => {
    const { rig, guests } = await room(1, 2);
    const [a, b] = guests;
    a.client.setProfile('G2', 1);
    await rig.run(RELAY_MS);
    expect(a.client.selfName).toBe('G2 (2)');
    expect(b.client.roster.get(a.client.selfId ?? -1)?.name).toBe('G2 (2)');
    // The host's name is taken too.
    a.client.setProfile('Hosta', 1);
    await rig.run(RELAY_MS);
    expect(a.client.selfName).toBe('Hosta (2)');
  });

  it("the host's saved guest entry carries the new name; the look is not saved", async () => {
    const { rig, guests } = await room(2);
    const [a] = guests;
    a.client.setProfile('Renamed', 6);
    await rig.run(RELAY_MS);
    const entry = rig.host.guestEntries().find((e) => e.key === a.key);
    expect(entry?.name).toBe('Renamed');
    expect(entry && 'look' in entry).toBe(false);
  });

  it('a reconnect says hello with the new name and look', async () => {
    const { rig, guests } = await room(2);
    const [a] = guests;
    a.client.setProfile('Later', 8);
    await rig.run(RELAY_MS);
    a.client.dropConnection();
    await rig.run(8000);
    expect(a.client.status).toBe('online');
    expect(rig.host.roster.get(a.client.selfId ?? -1)).toMatchObject({ name: 'Later', look: 8 });
  });

  it('profile counts towards the rate limit', async () => {
    const { rig, guests } = await room(1);
    const [a] = guests;
    for (let i = 0; i < ACTION_RATE_LIMIT; i++) a.client.submit({ kind: 'selectSlot', slot: 1 });
    a.client.setProfile('TooMany', 3);
    await rig.run(RELAY_MS);
    expect(rig.host.roster.get(a.client.selfId ?? -1)?.name).toBe('G1');
    // A second later the limit is lifted.
    await rig.run(1000);
    a.client.setProfile('Fine', 3);
    await rig.run(RELAY_MS);
    expect(rig.host.roster.get(a.client.selfId ?? -1)).toMatchObject({ name: 'Fine', look: 3 });
  });
});

describe('pose flags (Phase 6 AC12.3)', () => {
  it('busy and fly reach every other player in poses', async () => {
    const { rig, guests } = await room(1, 2);
    const [a, b] = guests;
    const pose = { ...rig.hostPose, x: rig.hostPose.x + 1 };
    a.client.setPose(pose, rig.net.nowMs, false, true, true);
    rig.hostFlags = { fly: false, busy: true };
    await rig.run(RELAY_MS);
    expect(rig.host.roster.get(a.client.selfId ?? -1)).toMatchObject({ fly: true, busy: true });
    expect(b.client.roster.get(a.client.selfId ?? -1)).toMatchObject({ fly: true, busy: true });
    expect(a.client.roster.get(1)).toMatchObject({ fly: false, busy: true });
    expect(b.client.roster.get(1)).toMatchObject({ fly: false, busy: true });
  });

  it('a change of busy alone is sent; an unchanged pose with unchanged busy is not', async () => {
    const { rig, guests } = await room(1);
    const [a] = guests;
    const pose = { ...rig.hostPose, x: rig.hostPose.x + 1 };
    a.client.setPose(pose, rig.net.nowMs);
    await rig.run(RELAY_MS);
    const sent = a.client.posesSent;
    a.client.setPose(pose, rig.net.nowMs);
    await rig.run(RELAY_MS);
    expect(a.client.posesSent).toBe(sent);
    a.client.setPose(pose, rig.net.nowMs, false, false, true);
    await rig.run(RELAY_MS);
    expect(a.client.posesSent).toBe(sent + 1);
    expect(rig.host.roster.get(a.client.selfId ?? -1)?.busy).toBe(true);
    // The host relays a change of its own busy alone, too.
    const before = a.client.roster.get(1)?.busy;
    rig.hostFlags = { fly: false, busy: !before };
    await rig.run(RELAY_MS);
    expect(a.client.roster.get(1)?.busy).toBe(!before);
  });

  it('a block change counts for the player who caused it', async () => {
    const { rig, guests } = await room(1, 2);
    const [a, b] = guests;
    const x = Math.floor(rig.hostPose.x) + 2;
    const z = Math.floor(rig.hostPose.z);
    let y = Math.floor(rig.hostPose.y) + 1;
    while (rig.world.getBlock(x, y, z) !== Block.AIR) y++;
    a.client.submit({ kind: 'place', x, y, z, slot: 2 });
    await rig.run(RELAY_MS);
    const id = a.client.selfId ?? -1;
    expect(rig.host.roster.get(id)?.edits).toBe(1);
    expect(b.client.roster.get(id)?.edits).toBe(1);
    rig.host.local.submit({ kind: 'break', x, y, z });
    await rig.run(RELAY_MS);
    expect(a.client.roster.get(1)?.edits).toBe(1);
    expect(b.client.roster.get(1)?.edits).toBe(1);
  });
});
