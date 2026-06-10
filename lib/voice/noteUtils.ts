// 주파수 ↔ 음이름(MIDI) 변환.
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function freqToMidi(freq: number): number {
  return 12 * Math.log2(freq / 440) + 69;
}

export function midiToNoteName(midi: number): string {
  const m = Math.round(midi);
  const octave = Math.floor(m / 12) - 1;
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  return `${name}${octave}`;
}

export function freqToNoteName(freq: number): string {
  if (!isFinite(freq) || freq <= 0) return "-";
  return midiToNoteName(freqToMidi(freq));
}

export function semitonesBetween(low: number, high: number): number {
  if (low <= 0 || high <= 0) return 0;
  return 12 * Math.log2(high / low);
}
