import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe('Notification ping playback', () => {
  it('waits for a user gesture before creating an audio context', async () => {
    const constructor = vi.fn();
    vi.stubGlobal('AudioContext', constructor);
    const sound = await import('./notification-sound');
    sound.playNotificationPing();
    expect(constructor).not.toHaveBeenCalled();
  });
  it('plays two quiet notes after audio is unlocked', async () => {
    const oscillators: Array<{
      frequency: { value: number };
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const gains: Array<{ gain: { linearRampToValueAtTime: ReturnType<typeof vi.fn> } }> = [];
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'running';
        currentTime = 10;
        destination = {};
        createOscillator() {
          const oscillator = {
            type: '',
            frequency: { value: 0 },
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
          };
          oscillators.push(oscillator);
          return oscillator;
        }
        createGain() {
          const gain = {
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
          gains.push(gain);
          return gain;
        }
      },
    );
    const sound = await import('./notification-sound');
    await sound.armNotificationSound();
    sound.playNotificationPing();
    expect(oscillators.map((o) => o.frequency.value)).toEqual([880, 1174.66]);
    expect(oscillators[0]?.start).toHaveBeenCalledWith(10);
    expect(oscillators[1]?.stop).toHaveBeenCalledWith(10.73);
    expect(gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.12, 10.008);
  });
  it('keeps notification delivery usable when the browser blocks sound', async () => {
    const oscillator = vi.fn();
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        resume() {
          return Promise.reject(new Error('Blocked'));
        }
        createOscillator = oscillator;
      },
    );
    const sound = await import('./notification-sound');
    await sound.armNotificationSound();
    sound.playNotificationPing();
    expect(oscillator).not.toHaveBeenCalled();
  });
});
