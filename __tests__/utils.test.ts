// Node's crypto is only used here to cross-check the crypto-js implementation
const nodeCrypto = require('crypto');
import { Buffer } from 'buffer';
import { encryptAES, decryptAES } from '../src/utils/aesEncryption';
import { encryptDES, decryptDES, isValidDESKey } from '../src/utils/desEncryption';
import { encryptCaesar, decryptCaesar } from '../src/utils/caesarCipher';
import { encryptRSA, decryptRSA, isValidRSAKey } from '../src/utils/rsaEncryption';
import {
  generateKeyPair,
  sign,
  verify,
  isValidPublicKey,
  isValidPrivateKey,
  extractMessage,
  extractSignature,
} from '../src/utils/digitalSignature';
import { fileHandler, FileData } from '../src/utils/fileHandler';
import { frameMessage, FrameDecoder } from '../src/utils/framing';

const SAMPLES = [
  'Hello, World!',
  'Xin chào! Tin nhắn tiếng Việt có dấu: ắ ằ ẳ ẵ ặ đ',
  '🔐 emoji 你好世界 مرحبا',
  'A'.repeat(5000),
  JSON.stringify({ type: 'TEXT', text: 'json payload', metadata: { username: 'Minh' } }),
];

describe('symmetric ciphers round-trip', () => {
  test.each(SAMPLES)('AES: %#', text => {
    const enc = encryptAES(text, 'ChatNET1');
    expect(enc).not.toBe(text);
    expect(decryptAES(enc, 'ChatNET1')).toBe(text);
  });

  test('AES uses a random IV (same input → different ciphertext)', () => {
    expect(encryptAES('same', 'k')).not.toBe(encryptAES('same', 'k'));
  });

  test.each(SAMPLES)('DES: %#', text => {
    expect(decryptDES(encryptDES(text, 'key12345'), 'key12345')).toBe(text);
  });

  test.each(SAMPLES)('RSA-like: %#', text => {
    expect(decryptRSA(encryptRSA(text, 'pub'), 'pub')).toBe(text);
  });

  test.each([0, 3, 13, 25, 29, -5])('Caesar shift %i', shift => {
    const text = 'Hello Zebra xyz ABC';
    expect(decryptCaesar(encryptCaesar(text, shift), shift)).toBe(text);
  });

  test('Caesar shifts letters', () => {
    expect(encryptCaesar('abc XYZ', 3)).toBe('def ABC');
  });

  test('key validators', () => {
    expect(isValidDESKey('')).toBe(false);
    expect(isValidDESKey('x'.repeat(17))).toBe(false);
    expect(isValidDESKey('ok')).toBe(true);
    expect(isValidRSAKey('x'.repeat(33))).toBe(false);
    expect(isValidRSAKey('ok')).toBe(true);
  });
});

describe('encryption fails closed', () => {
  const CryptoJS = require('crypto-js');

  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['AES', encryptAES],
    ['RSA-like', encryptRSA],
  ])('%s throws instead of returning plaintext when no secure RNG exists', (_name, encrypt) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(CryptoJS.lib.WordArray, 'random').mockImplementation(() => {
      throw new Error('no secure RNG');
    });
    expect(() => encrypt('secret', 'key')).toThrow('no secure RNG');
  });
});

describe('digitalSignature (crypto-js, React Native compatible)', () => {
  test('matches Node crypto output exactly', () => {
    const seed = 'testkey123';
    const priv = nodeCrypto.createHash('sha256').update(seed + 'private').digest('hex');
    const pub = nodeCrypto.createHash('sha256').update(priv + 'public').digest('hex');
    expect(generateKeyPair(seed)).toEqual({
      publicKey: pub.substring(0, 32),
      privateKey: priv.substring(0, 32),
    });

    const msg = 'Tin nhắn 🔐';
    const expectedSig = nodeCrypto.createHmac('sha256', 'k' + 'sign_salt').update(msg).digest('hex');
    expect(sign(msg, 'k')).toBe(`${expectedSig}:${msg}`);
  });

  test('seed validation', () => {
    expect(() => generateKeyPair('')).toThrow('Seed must be');
    expect(() => generateKeyPair('a'.repeat(33))).toThrow('Seed must be');
  });

  test.each(SAMPLES.concat(['Time: 10:30:45 - URL: http://example.com']))('sign/verify %#', message => {
    const { privateKey } = generateKeyPair('key456');
    const signed = sign(message, privateKey);
    expect(verify(signed, privateKey)).toBe(true);
    expect(extractMessage(signed)).toBe(message);
    expect(extractSignature(signed)).toMatch(/^[a-f0-9]{64}$/);
  });

  test('rejects tampered message and wrong key', () => {
    const { privateKey } = generateKeyPair('key789');
    const signed = sign('Test message', privateKey);
    expect(verify(signed.replace('Test', 'Hack'), privateKey)).toBe(false);
    expect(verify(signed, generateKeyPair('other').privateKey)).toBe(false);
  });

  test('error handling and validators', () => {
    expect(() => sign('', 'k')).toThrow('Message cannot be empty');
    expect(() => sign('m', 'a'.repeat(33))).toThrow('Private key must be');
    expect(isValidPublicKey('valid')).toBe(true);
    expect(isValidPublicKey(null as any)).toBe(false);
    expect(isValidPrivateKey('a'.repeat(33))).toBe(false);
    expect(sign('same', 'k')).toBe(sign('same', 'k'));
  });
});

describe('fileHandler message protocol', () => {
  const file: FileData = {
    fileName: 'photo.jpg',
    fileSize: 12,
    fileContent: Buffer.from('fake image!!').toString('base64'),
    mimeType: 'image/jpeg',
    type: 'image',
  };

  test('create → parse round-trip (also through AES)', () => {
    const msg = fileHandler.createFileMessage(file);
    const parsed = fileHandler.parseFileMessage(decryptAES(encryptAES(msg, 'k'), 'k'));
    expect(parsed?.valid).toBe(true);
    expect(parsed?.fileData.fileName).toBe('photo.jpg');
  });

  test('detects corrupted content via checksum', () => {
    const obj = JSON.parse(fileHandler.createFileMessage(file));
    obj.data.fileContent = Buffer.from('tampered!!!!').toString('base64');
    const parsed = fileHandler.parseFileMessage(JSON.stringify(obj));
    expect(parsed?.valid).toBe(false);
  });

  test('non-file messages return null', () => {
    expect(fileHandler.parseFileMessage('hello')).toBeNull();
    expect(fileHandler.parseFileMessage('{"type":"TEXT","text":"x"}')).toBeNull();
  });

  test('size validation', () => {
    expect(fileHandler.validateFileSize(0).valid).toBe(false);
    expect(fileHandler.validateFileSize(11 * 1024 * 1024).valid).toBe(false);
    expect(fileHandler.validateFileSize(1024).valid).toBe(true);
  });
});

describe('TCP framing', () => {
  test('header carries the UTF-8 byte length', () => {
    const framed = frameMessage('đ'); // 1 JS char, 2 bytes
    expect(framed.slice(0, 11).toString()).toBe('0000000002|');
    expect(framed.length).toBe(13);
  });

  test('reassembles payloads split at every byte (incl. inside multi-byte chars)', () => {
    const text = 'Xin chào 🔐 tiếng Việt';
    const framed = frameMessage(text);
    const decoder = new FrameDecoder();
    const out: string[] = [];
    for (let i = 0; i < framed.length; i++) {
      out.push(...decoder.push(framed.slice(i, i + 1)));
    }
    expect(out).toEqual([text]);
  });

  test('decodes several frames arriving in one chunk', () => {
    const decoder = new FrameDecoder();
    const chunk = Buffer.concat(SAMPLES.map(frameMessage));
    expect(decoder.push(chunk)).toEqual(SAMPLES);
  });

  test('legacy unframed data is passed through', () => {
    expect(new FrameDecoder().push('plain legacy text')).toEqual(['plain legacy text']);
  });

  test('accepts string chunks', () => {
    expect(new FrameDecoder().push('0000000005|hello')).toEqual(['hello']);
  });
});
