import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return (
    str
      // CSI sequences: ESC [ ... final-byte (covers ?, >, private modes)
      .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "")
      // OSC sequences: ESC ] ... BEL or ST
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
      // DCS / PM / APC / SOS sequences: ESC [P X ^ _] ... ST
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "")
      // Other 2-char ESC sequences (ESC followed by a printable char)
      .replace(/\x1b[\x20-\x7e]/g, "")
      // C1 control codes (0x80–0x9F)
      .replace(/[\x80-\x9f]/g, "")
      // Any remaining lone ESC
      .replace(/\x1b/g, "")
      // Carriage returns without newline (overwrite cursor moves)
      .replace(/\r(?!\n)/g, "")
  );
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}
