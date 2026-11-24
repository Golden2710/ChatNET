// Acts as a second ChatNET device: sends AES-encrypted frames to the app in tiny TCP writes.
import fs from 'node:fs';
import net from 'node:net';
import { encryptAES } from '../src/utils/aesEncryption';
import { fileHandler } from '../src/utils/fileHandler';
import { frameMessage } from '../src/utils/framing';

const KEY = 'ChatNET1';
const image = fs.readFileSync('assets/send.png');

const text = JSON.stringify({
  type: 'TEXT',
  text: 'Xin chào từ máy B 👋 tiếng Việt có dấu: ắằẳẵặ đ',
  metadata: { username: 'Máy B', autoDeleteIn: 0 },
});
const file = fileHandler.createFileMessage({
  fileName: 'peer-image.png',
  fileSize: image.length,
  fileContent: image.toString('base64'),
  mimeType: 'image/png',
  type: 'image',
});

const send = (payload: string, chunkSize: number) =>
  new Promise<void>((resolve, reject) => {
    const data = Buffer.from(frameMessage(encryptAES(payload, KEY)));
    const socket = net.createConnection(8888, '127.0.0.1', async () => {
      for (let i = 0; i < data.length; i += chunkSize) {
        if (!socket.write(data.subarray(i, i + chunkSize))) {
          await new Promise(r => socket.once('drain', r));
        }
        if (chunkSize < 16) await new Promise(r => setTimeout(r, 1));
      }
      // adb forward can drop queued bytes if the client closes right after writing
      await new Promise(r => setTimeout(r, 2000));
      socket.end(resolve);
    });
    socket.on('error', reject);
  });

(async () => {
  const kind = process.argv[2];
  if (kind === 'text') await send(text, 3);
  else if (kind === 'image') await send(file, 1024);
  else throw new Error('usage: peer <text|image>');
  console.log(`peer: sent ${kind}`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
