import {debugEscPos} from '../services/printer/escpos/debugEscPos';
import {EscPosBuilder} from '../services/printer/escpos/EscPosBuilder';

describe('debugEscPos', () => {
  it('decodes simple ASCII bytes correctly', () => {
    // Generate an ESC/POS byte array with bold, text, feed, cut
    const builder = new EscPosBuilder();
    builder.bold(true);
    builder.line('Hello World');
    builder.bold(false);
    builder.feed(2);
    builder.cut(true);
    const bytes = builder.build();

    const debugText = debugEscPos(bytes);

    expect(debugText).toContain('[INIT]');
    expect(debugText).toContain('[BOLD ON]');
    expect(debugText).toContain('Hello World\n');
    expect(debugText).toContain('[BOLD OFF]');
    expect(debugText).toContain('[FEED 2]');
    expect(debugText).toContain('[CUT PARTIAL]');
  });

  it('decodes UTF-8 characters manually without TextDecoder', () => {
    // UTF-8 bytes for "Café" -> C, a, f, \xc3, \xa9
    const utf8Bytes = new Uint8Array([0x43, 0x61, 0x66, 0xc3, 0xa9]);
    const debugText = debugEscPos(utf8Bytes);
    expect(debugText).toBe('Café');
  });
});
