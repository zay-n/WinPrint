/* eslint-disable no-bitwise */
/**
 * debugEscPos.ts — DEVELOPMENT ONLY utility to inspect generated ESC/POS bytes.
 */

export function debugEscPos(bytes: Uint8Array): string {
  let output = '';
  let i = 0;

  while (i < bytes.length) {
    const byte = bytes[i];

    if (byte === 0x1b) { // ESC
      const cmd = bytes[i + 1];
      if (cmd === 0x40) {
        output += '[INIT]\n';
        i += 2;
      } else if (cmd === 0x61) {
        const align = bytes[i + 2];
        output += `[ALIGN ${align === 1 ? 'CENTER' : align === 2 ? 'RIGHT' : 'LEFT'}]\n`;
        i += 3;
      } else if (cmd === 0x45) {
        const enable = bytes[i + 2];
        output += `[BOLD ${enable ? 'ON' : 'OFF'}]\n`;
        i += 3;
      } else if (cmd === 0x2d) {
        const enable = bytes[i + 2];
        output += `[UNDERLINE ${enable ? 'ON' : 'OFF'}]\n`;
        i += 3;
      } else if (cmd === 0x64) {
        const lines = bytes[i + 2];
        output += `[FEED ${lines}]\n`;
        i += 3;
      } else {
        output += `[ESC ${cmd.toString(16)}]\n`;
        i += 2;
      }
    } else if (byte === 0x1d) { // GS
      const cmd = bytes[i + 1];
      if (cmd === 0x21) {
        const n = bytes[i + 2];
        const w = (n >> 4) + 1;
        const h = (n & 0x0f) + 1;
        output += `[TEXT_SIZE ${w}x${h}]\n`;
        i += 3;
      } else if (cmd === 0x56) {
        const type = bytes[i + 2];
        if (type === 0x42) {
          output += `[CUT PARTIAL]\n`;
          i += 4;
        } else {
          output += `[CUT FULL]\n`;
          i += 3;
        }
      } else {
        output += `[GS ${cmd.toString(16)}]\n`;
        i += 2;
      }
    } else if (byte === 0x0a) { // LF
      output += '\n';
      i += 1;
    } else {
      // Decode printable text
      let textLen = 0;
      while (i + textLen < bytes.length && bytes[i + textLen] >= 0x20 && bytes[i + textLen] !== 0x1b && bytes[i + textLen] !== 0x1d) {
        textLen++;
      }
      if (textLen > 0) {
        const textBytes = bytes.slice(i, i + textLen);
        output += decodeUtf8(textBytes);
        i += textLen;
      } else {
        // Unrecognized control byte
        i += 1;
      }
    }
  }

  return output;
}

/** Minimal UTF-8 decoder for React Native where TextDecoder is not available. */
function decodeUtf8(bytes: Uint8Array): string {
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) {
      str += String.fromCharCode(c);
    } else if (c > 0xbf && c < 0xe0) {
      const c2 = bytes[i++];
      str += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
    } else if (c > 0xdf && c < 0xf0) {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      str += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
    } else {
      const c2 = bytes[i++];
      const c3 = bytes[i++];
      const c4 = bytes[i++];
      let cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
      cp -= 0x10000;
      str += String.fromCharCode((cp >> 10) | 0xd800, (cp & 0x3ff) | 0xdc00);
    }
  }
  return str;
}
