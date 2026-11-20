// DualSense HD haptics over USB audio. The controller enumerates as a
// 4-channel audio output: channels 1-2 are the speaker/headset, 3-4 drive
// the left/right voice-coil actuators. We synthesise a waveform onto 3-4.

const DEVICE_LABEL = /dualsense|wireless controller/i;

const ROLL_BASE_HZ = 0;
const ROLL_SPEED_HZ = 0; // extra pitch at full speed
const ROLL_SMOOTHING = 0.00; // seconds
const BUMP_HZ = 110;
const BUMP_DECAY = 0.07; // seconds
const BUMP_GAIN = 1;

export class AudioHaptics {
  private constructor(
    private ctx: AudioContext,
    private output: AudioNode,
    private rollOsc: OscillatorNode,
    private rollGain: GainNode,
  ) {}

  static supported() {
    return 'setSinkId' in AudioContext.prototype;
  }

  // Call from a user gesture. Throws with a readable message on failure.
  static async connect(): Promise<AudioHaptics> {
    // Device labels are hidden until the page has mic permission.
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    mic.getTracks().forEach((t) => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const sink = devices.find((d) => d.kind === 'audiooutput' && DEVICE_LABEL.test(d.label));
    if (!sink) throw new Error('DualSense audio device not found (USB only)');

    // Open directly on the DualSense rather than switching from the default output.
    const ctx = new AudioContext({ latencyHint: 'interactive', sinkId: sink.deviceId } as AudioContextOptions);
    await ctx.resume();

    const dest = ctx.destination;
    if (dest.maxChannelCount < 4) {
      await ctx.close();
      throw new Error(
        `Chrome sees ${dest.maxChannelCount} channels on the DualSense, need 4. ` +
          'Plug it in over USB and fully restart Chrome',
      );
    }
    dest.channelCount = 4;
    dest.channelCountMode = 'explicit';
    dest.channelInterpretation = 'discrete';

    // Mono haptic signal -> both actuators (channels 3 and 4).
    const output = ctx.createGain();
    const merger = ctx.createChannelMerger(4);
    output.connect(merger, 0, 2);
    output.connect(merger, 0, 3);
    merger.connect(dest);

    const rollOsc = ctx.createOscillator();
    rollOsc.frequency.value = ROLL_BASE_HZ;
    const rollGain = ctx.createGain();
    rollGain.gain.value = 0;
    rollOsc.connect(rollGain).connect(output);
    rollOsc.start();

    return new AudioHaptics(ctx, output, rollOsc, rollGain);
  }

  // Rolling intensity 0..1 (amplitude) and speed 0..1 (pitch).
  // Smoothed on the audio thread, so call every frame.
  setRoll(intensity: number, speed: number) {
    const t = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(intensity, t, ROLL_SMOOTHING);
    this.rollOsc.frequency.setTargetAtTime(ROLL_BASE_HZ + speed * ROLL_SPEED_HZ, t, ROLL_SMOOTHING);
  }

  // One-shot thump, strength 0..1.
  bump(strength: number) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.frequency.value = BUMP_HZ;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(strength * BUMP_GAIN, t + 0.003);
    env.gain.setTargetAtTime(0, t + 0.003, BUMP_DECAY / 3);
    osc.connect(env).connect(this.output);
    osc.start(t);
    osc.stop(t + BUMP_DECAY * 2);
  }

  silence() {
    this.rollGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.rollGain.gain.setValueAtTime(0, this.ctx.currentTime);
  }
}
