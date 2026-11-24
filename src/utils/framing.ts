import { Buffer } from 'buffer';

/**
 * TCP message framing.
 *
 * Frame format: [10 ASCII digits = payload length in UTF-8 BYTES]['|'][payload bytes]
 *
 * The length is measured in bytes (not JS string length) and incoming data is
 * buffered as raw bytes, so multi-byte UTF-8 characters (Vietnamese, emoji…)
 * that get split across TCP packets are reassembled correctly.
 */
export const FRAME_HEADER_LENGTH = 11;
const SEPARATOR = 0x7c; // '|'

export const frameMessage = (payload: string): Buffer => {
  const payloadBytes = Buffer.from(payload, 'utf8');
  const header = Buffer.from(payloadBytes.length.toString().padStart(10, '0') + '|', 'utf8');
  return Buffer.concat([header, payloadBytes]);
};

const toBuffer = (data: string | Uint8Array): Buffer =>
  typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);

/**
 * Accumulates incoming chunks and returns every complete payload.
 * Data without a valid header (legacy senders) is returned as a single payload.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  push(data: string | Uint8Array): string[] {
    this.buffer = Buffer.concat([this.buffer, toBuffer(data)]);
    const payloads: string[] = [];

    while (this.buffer.length >= FRAME_HEADER_LENGTH) {
      const lenStr = this.buffer.slice(0, 10).toString('utf8');

      if (!/^\d{10}$/.test(lenStr) || this.buffer[10] !== SEPARATOR) {
        // Legacy/invalid framing - treat the whole buffer as one message
        payloads.push(this.buffer.toString('utf8'));
        this.buffer = Buffer.alloc(0);
        break;
      }

      const payloadLen = parseInt(lenStr, 10);
      if (this.buffer.length < FRAME_HEADER_LENGTH + payloadLen) break; // wait for more data

      payloads.push(
        this.buffer.slice(FRAME_HEADER_LENGTH, FRAME_HEADER_LENGTH + payloadLen).toString('utf8'),
      );
      this.buffer = this.buffer.slice(FRAME_HEADER_LENGTH + payloadLen);
    }

    return payloads;
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }
}
