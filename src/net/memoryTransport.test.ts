import { describe, expect, it } from 'vitest';
import { MemoryNetwork } from './memoryTransport';
import { type Connection, SignalError } from './transport';

async function pair(net: MemoryNetwork): Promise<[Connection, Connection]> {
  const a = net.signaling();
  const b = net.signaling();
  const opened = Promise.all([a.open('a'), b.open('b')]);
  net.advance(1000);
  await opened;
  let theirs: Connection | null = null;
  b.onConnection = (c) => {
    theirs = c;
  };
  const mine = a.connect('b');
  net.advance(1000);
  const connection = await mine;
  if (!theirs) throw new Error('no incoming connection');
  return [connection, theirs];
}

describe('memory transport', () => {
  it('Phase 6 AC1.6: delivers in order per connection under seeded delays', async () => {
    const net = new MemoryNetwork({ seed: 7, minDelayMs: 0, maxDelayMs: 300 });
    const [a, b] = await pair(net);
    const atB: string[] = [];
    const atA: string[] = [];
    b.onMessage = (text) => atB.push(text);
    a.onMessage = (text) => atA.push(text);
    for (let i = 0; i < 500; i++) {
      a.send(`a${i}`);
      b.send(`b${i}`);
      // Sending spread over time, so delays of later messages are often shorter.
      net.advance(i % 3);
    }
    expect(a.bufferedAmount()).toBeGreaterThan(0);
    net.advance(1000);
    expect(atB).toEqual(Array.from({ length: 500 }, (_, i) => `a${i}`));
    expect(atA).toEqual(Array.from({ length: 500 }, (_, i) => `b${i}`));
    expect(a.bufferedAmount()).toBe(0);
    expect(net.pending).toBe(0);
  });

  it('Phase 6 AC1.6: reports closing to both ends, after the messages sent before', async () => {
    const net = new MemoryNetwork({ seed: 3, minDelayMs: 10, maxDelayMs: 200 });
    const [a, b] = await pair(net);
    const events: string[] = [];
    a.onClose = () => events.push('a closed');
    b.onClose = () => events.push('b closed');
    b.onMessage = (text) => events.push(`b got ${text}`);
    a.send('last');
    a.close();
    expect(a.open).toBe(false);
    expect(events).toEqual(['a closed']);
    a.send('after close');
    net.advance(1000);
    expect(events).toEqual(['a closed', 'b got last', 'b closed']);
    expect(b.open).toBe(false);
    // Closing twice reports nothing more.
    b.close();
    a.close();
    expect(events).toHaveLength(3);
    expect(await a.stats()).toBeNull();
  });

  it('refuses taken ids, unknown ids and an unreachable server', async () => {
    const net = new MemoryNetwork({ minDelayMs: 5 });
    const a = net.signaling();
    const b = net.signaling();
    const first = a.open('x');
    const second = b.open('x').catch((e: SignalError) => e.reason);
    net.advance(10);
    await first;
    expect(await second).toBe('taken');
    expect(a.id).toBe('x');
    expect(a.state).toBe('open');
    const missing = a.connect('nobody').catch((e: SignalError) => e.reason);
    net.advance(10);
    expect(await missing).toBe('not-found');
    net.reachable = false;
    const c = net.signaling();
    const unreachable = c.open('y').catch((e: SignalError) => e.reason);
    const list = net.directory().list();
    net.advance(10);
    expect(await unreachable).toBe('unreachable');
    expect(c.state).toBe('lost');
    expect(await list).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('lists registered ids unless discovery is off; close and lose unregister', async () => {
    const net = new MemoryNetwork();
    const a = net.signaling();
    const b = net.signaling();
    const opened = Promise.all([a.open('a'), b.open('b')]);
    net.advance(0);
    await opened;
    const list = net.directory().list();
    net.advance(0);
    expect(await list).toEqual({ ok: true, ids: ['a', 'b'] });
    const states: string[] = [];
    b.onStateChange = (s) => states.push(s);
    b.lose();
    expect(states).toEqual(['lost']);
    a.close();
    expect(a.id).toBeNull();
    // Both ids are free again.
    const [x, y] = await pair(net);
    let closed = 0;
    x.onClose = () => closed++;
    y.onClose = () => closed++;
    net.discovery = false;
    const off = net.directory().list();
    net.advance(0);
    expect(await off).toEqual({ ok: false, reason: 'off' });
    // The pair made by `pair` belongs to other signalings and stays open.
    expect(closed).toBe(0);
  });

  it('closes the connections of a signaling that closes', async () => {
    const net = new MemoryNetwork({ minDelayMs: 1 });
    const a = net.signaling();
    const b = net.signaling();
    const opened = Promise.all([a.open('a'), b.open('b')]);
    net.advance(5);
    await opened;
    let incoming: Connection | null = null;
    b.onConnection = (c) => {
      incoming = c;
    };
    const outgoing = a.connect('b');
    net.advance(5);
    const conn = await outgoing;
    let remoteClosed = false;
    if (!incoming) throw new Error('no incoming connection');
    (incoming as Connection).onClose = () => {
      remoteClosed = true;
    };
    a.close();
    expect(conn.open).toBe(false);
    net.advance(5);
    expect(remoteClosed).toBe(true);
  });
});
