/**
 * EscPosBuilder.ts — Fluent ESC/POS command builder for 80mm thermal printers
 *
 * Implements standard ESC/POS control sequences for thermal receipt generation:
 * - Initialize: ESC @
 * - Justification: ESC a n (left, center, right)
 * - Emphasized (bold): ESC E n
 * - Character size: GS ! n (normal, double-height, double-width, 2x2)
 * - Underline: ESC - n
 * - Line feed: LF
 * - Paper feed: ESC d n
 * - Paper cut: GS V 66 n / GS V n
 */

export type EscPosAlignment = 'left' | 'center' | 'right';

export class EscPosBuilder {
  private buffer: number[] = [];
  private encoder = new TextEncoder();

  /** Standard 80mm thermal paper printable character width with Font A. */
  public static readonly DEFAULT_80MM_WIDTH = 48;

  constructor() {
    this.init();
  }

  /** Appends raw bytes directly to the buffer. */
  public raw(bytes: number[] | Uint8Array): this {
    if (bytes instanceof Uint8Array) {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer.push(bytes[i]);
      }
    } else {
      this.buffer.push(...bytes);
    }
    return this;
  }

  /** ESC @ — Initialize printer to default state. */
  public init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /** ESC a n — Set text alignment. */
  public align(alignment: EscPosAlignment): this {
    const val = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1b, 0x61, val);
    return this;
  }

  /** ESC E n — Turn emphasized (bold) mode on/off. */
  public bold(enable = true): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  /** ESC - n — Turn underline mode on/off. */
  public underline(enable = true): this {
    this.buffer.push(0x1b, 0x2d, enable ? 1 : 0);
    return this;
  }

  /**
   * GS ! n — Select character size.
   * width: 1 to 8 (multiplier)
   * height: 1 to 8 (multiplier)
   */
  public textSize(width = 1, height = 1): this {
    const w = Math.min(8, Math.max(1, width)) - 1;
    const h = Math.min(8, Math.max(1, height)) - 1;
    const n = (w << 4) | h;
    this.buffer.push(0x1d, 0x21, n);
    return this;
  }

  /** Appends plain text without a newline. */
  public text(str: string): this {
    if (!str) {
      return this;
    }
    const bytes = this.encoder.encode(str);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  /** Appends plain text followed by a line feed (LF). */
  public line(str = ''): this {
    if (str) {
      this.text(str);
    }
    this.buffer.push(0x0a);
    return this;
  }

  /** ESC d n — Feed n lines. */
  public feed(lines = 1): this {
    const count = Math.min(255, Math.max(1, lines));
    this.buffer.push(0x1b, 0x64, count);
    return this;
  }

  /**
   * GS V m n — Partial or full paper cut.
   * partial: true uses partial cut with feed (GS V 66 0).
   */
  public cut(partial = true): this {
    if (partial) {
      // Feed paper and partial cut: GS V 66 0
      this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    } else {
      // Full cut: GS V 0
      this.buffer.push(0x1d, 0x56, 0x00);
    }
    return this;
  }

  /**
   * Formats two strings on the same line, one left-aligned and one right-aligned.
   * If combined length fits within width, pads with spaces.
   * If it exceeds width, prints left text on line 1 and right text on line 2.
   */
  public leftRight(
    left: string,
    right: string,
    width = EscPosBuilder.DEFAULT_80MM_WIDTH,
  ): this {
    const leftTrim = left.trim();
    const rightTrim = right.trim();

    const spaceCount = width - (leftTrim.length + rightTrim.length);
    if (spaceCount >= 0) {
      this.line(leftTrim + ' '.repeat(spaceCount) + rightTrim);
    } else {
      // Does not fit on single line: line 1 left, line 2 right-aligned
      this.line(leftTrim);
      const rightPad = Math.max(0, width - rightTrim.length);
      this.line(' '.repeat(rightPad) + rightTrim);
    }
    return this;
  }

  /** Prints a horizontal separator line across the given width. */
  public separator(
    char = '-',
    width = EscPosBuilder.DEFAULT_80MM_WIDTH,
  ): this {
    if (char.length === 1) {
      this.line(char.repeat(width));
    } else {
      const repeated = char.repeat(Math.ceil(width / char.length));
      this.line(repeated.slice(0, width));
    }
    return this;
  }

  /**
   * Returns a Uint8Array containing the complete ESC/POS byte sequence.
   */
  public build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
