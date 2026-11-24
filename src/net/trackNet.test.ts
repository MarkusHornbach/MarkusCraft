// The tracked task in rooms (Polish 2 AC2.2): the host applies each player's choice to its
// own record, keeps it when the guest leaves, and saves it in the guest entry.
import { describe, expect, it } from 'vitest';
import { decodeMeta, encodeMeta } from '../save/saveFormat';
import { sampleMeta } from '../testing/sampleWorld';
import { Rig, type RigGuest } from '../testing/netRig';

async function until(rig: Rig, check: () => boolean, maxMs = 10_000): Promise<void> {
  for (let t = 0; t < maxMs; t += 10) {
    if (check()) return;
    await rig.run(10);
  }
  throw new Error('condition not reached');
}

async function trackAsGuest(rig: Rig, g: RigGuest, task: number): Promise<boolean> {
  const answers = g.answers.length;
  g.client.submit({ kind: 'track', task });
  await until(rig, () => g.answers.length > answers);
  return g.answers.at(-1)?.result.ok ?? false;
}

function entryTrack(rig: Rig, g: RigGuest): number | undefined {
  return rig.host.guestEntries().find((e) => e.key === g.key)?.record.track;
}

describe('the tracked task in rooms (Polish 2 AC2.2)', () => {
  it("Polish 2 AC2.2: each player's choice is its own, kept on return and saved", async () => {
    const rig = new Rig({ mode: 'gathering' });
    await rig.open();
    const g1 = rig.guest({ name: 'Anna' });
    const g2 = rig.guest({ name: 'Ben' });
    expect(await rig.join(g1, 5000)).toBeNull();
    expect(await rig.join(g2, 5000)).toBeNull();

    expect(await trackAsGuest(rig, g1, 3)).toBe(true);
    expect(await trackAsGuest(rig, g2, -1)).toBe(true);
    rig.host.local.submit({ kind: 'track', task: 2 });
    await until(rig, () => rig.hostRecord.track === 2);
    // A task of a later chapter is refused for a guest as for anyone.
    expect(await trackAsGuest(rig, g1, 5)).toBe(false);

    expect(g1.client.record.track).toBe(3);
    expect(g2.client.record.track).toBe(-1);
    expect(entryTrack(rig, g1)).toBe(3);
    expect(entryTrack(rig, g2)).toBe(-1);

    // Leaving and returning with the same key brings the choice back.
    g1.client.leave();
    await rig.run(200);
    g1.client.dispose();
    expect(entryTrack(rig, g1)).toBe(3);
    const again = rig.guest({ key: g1.key, name: 'Anna' });
    expect(await rig.join(again, 5000)).toBeNull();
    expect(again.client.record.track).toBe(3);

    // The guest entries go through the save format with their choice.
    const meta = { ...sampleMeta({ mode: 'gathering' }), guests: rig.host.guestEntries() };
    const loaded = decodeMeta(JSON.parse(JSON.stringify(encodeMeta(meta))));
    if (!loaded.ok) throw new Error(loaded.error);
    const byName = Object.fromEntries(loaded.value.guests.map((e) => [e.name, e.record.track]));
    expect(byName).toEqual({ Anna: 3, Ben: -1 });
  });
});
