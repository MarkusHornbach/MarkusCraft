// The host keeps every guest's record and place, in the room and in the world's save
// (Phase 6 part C, step 8).
import { describe, expect, it } from 'vitest';
import { createPlayerRecord } from '../actions/playerRecord';
import type { GuestEntry } from '../save/saveFormat';
import { RIG_EPOCH_MS, Rig, type RigGuest } from '../testing/netRig';
import { Block } from '../world/blocks';

const POSE_FAR = { x: 20.5, y: 80, z: -14.25, yaw: 1.5, pitch: -0.3 };

/** Joins `guest`, changes its bar and moves it away from the start. */
async function playAWhile(rig: Rig, guest: RigGuest): Promise<void> {
  expect(await rig.join(guest)).toBeNull();
  guest.client.submit({ kind: 'setBarSlot', slot: 4, item: Block.TORCH });
  guest.client.submit({ kind: 'selectSlot', slot: 4 });
  guest.client.setPose(POSE_FAR, rig.net.nowMs, false, true);
  await rig.run(300);
  expect(guest.client.record.slots[4]).toEqual({ item: Block.TORCH, count: 1 });
}

function entryOf(rig: Rig, guest: RigGuest): GuestEntry | undefined {
  return rig.host.guestEntries().find((g) => g.key === guest.key);
}

describe('guests in the host (Phase 6 AC8.3)', () => {
  it('a guest that leaves is kept with its record, pose and movement', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest({ name: 'Anna' });
    await playAWhile(rig, g);
    g.client.leave();
    await rig.run(200);
    const entry = entryOf(rig, g);
    expect(entry).toMatchObject({ name: 'Anna', pose: POSE_FAR, moveMode: 'fly' });
    expect(entry?.record.selectedSlot).toBe(4);
    expect(entry?.record.slots[4]).toEqual({ item: Block.TORCH, count: 1 });
    expect(entry?.lastSeenMs).toBeGreaterThan(RIG_EPOCH_MS);
  });

  it('a lost guest is kept too, and a guest in the room is listed as it is now', async () => {
    const rig = new Rig();
    await rig.open();
    const a = rig.guest();
    const b = rig.guest();
    await playAWhile(rig, a);
    await rig.join(b);
    // While connected: what an autosave writes.
    expect(entryOf(rig, a)).toMatchObject({ pose: POSE_FAR, moveMode: 'fly' });
    expect(entryOf(rig, b)?.record).toEqual(createPlayerRecord('creative'));
    // Gone without a goodbye, and it cannot come back: the heartbeat removes it.
    rig.net.reachable = false;
    a.client.dropConnection();
    await rig.run(6000);
    expect(rig.host.playerCount).toBe(2);
    expect(entryOf(rig, a)).toMatchObject({ pose: POSE_FAR });
    expect(entryOf(rig, a)?.record.selectedSlot).toBe(4);
    // Newest first: b was heard last.
    expect(rig.host.guestEntries()[0].key).toBe(b.key);
  });

  it('a returning key gets its record, pose and movement in the welcome', async () => {
    const rig = new Rig();
    await rig.open();
    const g = rig.guest();
    await playAWhile(rig, g);
    g.client.leave();
    await rig.run(200);
    g.client.dispose();
    const again = rig.guest({ key: g.key });
    expect(await rig.join(again)).toBeNull();
    expect(again.client.record.selectedSlot).toBe(4);
    expect(again.client.record.slots[4]).toEqual({ item: Block.TORCH, count: 1 });
    expect(again.welcome?.moveMode).toBe('fly');
    const self = rig.host.players().find((p) => p.id === again.client.selfId);
    expect(self?.pose).toEqual(POSE_FAR);
    // In the room again: listed once.
    expect(rig.host.guestEntries().filter((e) => e.key === g.key)).toHaveLength(1);
  });

  it('guests from the save come back after the host reopened the world', async () => {
    const first = new Rig();
    await first.open();
    const g = first.guest();
    await playAWhile(first, g);
    // The host closes the room (and the world is saved with its guests).
    first.host.close();
    const saved = first.host.guestEntries();
    expect(saved).toHaveLength(1);
    const rig = new Rig({ guests: saved });
    await rig.open();
    const again = rig.guest({ key: g.key });
    expect(await rig.join(again)).toBeNull();
    expect(again.client.record.slots[4]).toEqual({ item: Block.TORCH, count: 1 });
    expect(rig.host.players().find((p) => !p.host)?.pose).toEqual(POSE_FAR);
    // A new key starts with a fresh record next to the host.
    const stranger = rig.guest({ key: 'cd'.repeat(16) });
    expect(await rig.join(stranger)).toBeNull();
    expect(stranger.client.record).toEqual(createPlayerRecord('creative'));
  });

  it('nobody flies back into a Gathering world, and the host key is never a guest', async () => {
    const key = 'ab'.repeat(16);
    const record = createPlayerRecord('gathering');
    const entry: GuestEntry = {
      key,
      name: 'Bo',
      record,
      pose: POSE_FAR,
      moveMode: 'fly',
      lastSeenMs: 5,
    };
    const hostKey = 'ff' + '0'.repeat(30);
    const rig = new Rig({ mode: 'gathering', guests: [entry, { ...entry, key: hostKey }] });
    await rig.open();
    expect(rig.host.guestEntries().map((e) => e.key)).toEqual([key]);
    const again = rig.guest({ key });
    expect(await rig.join(again)).toBeNull();
    expect(again.welcome?.moveMode).toBe('walk');
    expect(again.welcome?.pose).toEqual(POSE_FAR);
    expect(rig.host.guestEntries()[0].moveMode).toBe('walk');
  });
});
