// Local PeerJS signaling server for browser tests and for trying multiplayer with
// `npm run dev`: `node scripts/signalServer.mjs [port] [--no-discovery]`.
// Binds to 127.0.0.1 explicitly (the cloud container has no IPv6). Pages use it with
// `?signal=http://127.0.0.1:9000/&stun=none`.
import { PeerServer } from 'peer';

const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) ?? 9000);
const discovery = !args.includes('--no-discovery');

PeerServer({ host: '127.0.0.1', port, path: '/', key: 'peerjs', allow_discovery: discovery }, () =>
  console.log(`signal server on http://127.0.0.1:${port}/ (discovery ${discovery ? 'on' : 'off'})`),
);
