// Pure Web Audio API Synthesizer for ringtones, call sounds, and camera shutter

class AudioEffectsManager {
  private ctx: AudioContext | null = null;
  private ringOscillators: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private ringInterval: any = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Play outgoing phone ring (US/European dual tone: 440Hz + 480Hz)
  public startOutgoingRingtone() {
    this.stopRingtone();
    const ctx = this.getContext();

    const playRingCycle = () => {
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.value = 440;
        osc2.frequency.value = 480;

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + 1.6);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.9);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 2.0);
        osc2.stop(ctx.currentTime + 2.0);
      } catch (err) {
        console.warn('Audio ringtone error:', err);
      }
    };

    playRingCycle();
    this.ringInterval = setInterval(playRingCycle, 4000);
  }

  // Play incoming ringtone (melodic chime)
  public startIncomingRingtone() {
    this.stopRingtone();
    const ctx = this.getContext();

    const playMelodicRing = () => {
      try {
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.18);
          gain.gain.setValueAtTime(0.15, now + idx * 0.18);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.18);
          osc.stop(now + idx * 0.18 + 0.4);
        });
      } catch (err) {
        console.warn('Audio incoming ringtone error:', err);
      }
    };

    playMelodicRing();
    this.ringInterval = setInterval(playMelodicRing, 2500);
  }

  public stopRingtone() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  // Pleasant connection chime when call answers
  public playCallConnected() {
    this.stopRingtone();
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [587.33, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.3);
      });
    } catch {
      // ignore
    }
  }

  // End call disconnect tone
  public playCallEnded() {
    this.stopRingtone();
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      [440, 330].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.35);
      });
    } catch {
      // ignore
    }
  }

  // Camera shutter click sound
  public playCameraShutter() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      // White noise burst
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      noise.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    } catch {
      // ignore
    }
  }

  // Message sent sound
  public playMessageSent() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // ignore
    }
  }
}

export const audioEffects = new AudioEffectsManager();
