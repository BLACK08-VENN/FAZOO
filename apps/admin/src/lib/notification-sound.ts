let context: AudioContext | null = null;

/** Original, quiet two-note chime. Audio is unlocked only by a user gesture. */
export async function armNotificationSound() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
  } catch {
    /* The unread bell works when the browser blocks audio. */
  }
}
export function playNotificationPing() {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  for (const [index, frequency] of [880, 1174.66].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const start = now + index * 0.13;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.6);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
