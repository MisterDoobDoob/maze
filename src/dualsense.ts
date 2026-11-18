// Minimal DualSense reader over WebHID (Chrome/Edge, secure context).
// Report layout follows the Linux hid-playstation driver.

const SONY_VENDOR = 0x054c;
const DUALSENSE = 0x0ce6;
const DUALSENSE_EDGE = 0x0df2;

const USB_REPORT = 0x01;
const BT_REPORT = 0x31;
const FEATURE_CALIBRATION = 0x05;
const USB_OUTPUT = 0x02;
const BT_OUTPUT = 0x31;

// Output report flags (hid-playstation naming).
const FLAG0_COMPATIBLE_VIBRATION = 0x01;
const FLAG0_HAPTICS_SELECT = 0x02;
const FLAG2_COMPATIBLE_VIBRATION2 = 0x04; // newer firmware

// Approximate sensor resolution (raw counts).
const ACC_PER_G = 8192;
const GYRO_PER_DEG_S = 1024;

export type Vec3 = [number, number, number];

export interface DualSenseState {
  accel: Vec3; // in g
  gyro: Vec3; // in rad/s
  cross: boolean;
  circle: boolean;
  connection: 'usb' | 'bluetooth';
}

export class DualSense {
  state: DualSenseState | null = null;
  onReport: ((s: DualSenseState, dt: number) => void) | null = null;

  private device: HIDDevice | null = null;
  private lastTime = 0;

  private rumble = { low: 0, high: 0 };
  private sentRumble = { low: -1, high: -1 };
  private sending = false;
  private btSeq = 0;

  static supported() {
    return 'hid' in navigator;
  }

  // Must be called from a user gesture (click).
  async connect() {
    const devices = await navigator.hid.requestDevice({
      filters: [
        { vendorId: SONY_VENDOR, productId: DUALSENSE },
        { vendorId: SONY_VENDOR, productId: DUALSENSE_EDGE },
      ],
    });
    const device = devices[0];
    if (!device) throw new Error('No controller selected');
    if (!device.opened) await device.open();

    // Over Bluetooth the controller sends a reduced report until a
    // calibration feature report is read; reading it switches to full 0x31.
    try {
      await device.receiveFeatureReport(FEATURE_CALIBRATION);
    } catch {
      // Not fatal over USB.
    }

    device.addEventListener('inputreport', this.handleReport);
    this.device = device;
  }

  // Motor strengths 0..1. `low` is the heavy motor, `high` the light, buzzy one.
  // Safe to call every frame: only changed values are sent, one at a time.
  setRumble(low: number, high: number) {
    this.rumble.low = Math.round(clamp01(low) * 255);
    this.rumble.high = Math.round(clamp01(high) * 255);
    void this.flushRumble();
  }

  private async flushRumble() {
    const device = this.device;
    const connection = this.state?.connection;
    if (!device || !connection || this.sending) return;
    const { low, high } = this.rumble;
    if (low === this.sentRumble.low && high === this.sentRumble.high) return;

    this.sending = true;
    let ok = false;
    try {
      const common = new Uint8Array(47);
      common[0] = FLAG0_COMPATIBLE_VIBRATION | FLAG0_HAPTICS_SELECT;
      common[2] = high; // right motor
      common[3] = low; // left motor
      common[38] = FLAG2_COMPATIBLE_VIBRATION2;

      if (connection === 'usb') {
        await device.sendReport(USB_OUTPUT, common);
      } else {
        const data = new Uint8Array(77);
        data[0] = (this.btSeq++ & 0x0f) << 4;
        data[1] = 0x10;
        data.set(common, 2);
        // CRC covers a 0xA2 seed byte, the report ID and the payload before the CRC.
        const crc = crc32([0xa2, BT_OUTPUT], data.subarray(0, 73));
        new DataView(data.buffer).setUint32(73, crc, true);
        await device.sendReport(BT_OUTPUT, data);
      }
      this.sentRumble = { low, high };
      ok = true;
    } catch {
      // Drop this update; the next setRumble call retries.
    } finally {
      this.sending = false;
    }
    // Catch any change that arrived while we were sending.
    if (ok) void this.flushRumble();
  }

  async disconnect() {
    if (!this.device) return;
    this.device.removeEventListener('inputreport', this.handleReport);
    await this.device.close();
    this.device = null;
    this.state = null;
  }

  private handleReport = (e: HIDInputReportEvent) => {
    let offset: number;
    let connection: DualSenseState['connection'];
    if (e.reportId === USB_REPORT && e.data.byteLength >= 63) {
      offset = 0;
      connection = 'usb';
    } else if (e.reportId === BT_REPORT) {
      offset = 1;
      connection = 'bluetooth';
    } else {
      return; // reduced BT report without motion data
    }

    const d = e.data;
    const i16 = (at: number) => d.getInt16(at + offset, true);
    const gyroScale = (Math.PI / 180) / GYRO_PER_DEG_S;
    const buttons0 = d.getUint8(7 + offset);

    const state: DualSenseState = {
      gyro: [i16(15) * gyroScale, i16(17) * gyroScale, i16(19) * gyroScale],
      accel: [i16(21) / ACC_PER_G, i16(23) / ACC_PER_G, i16(25) / ACC_PER_G],
      cross: (buttons0 & 0x20) !== 0,
      circle: (buttons0 & 0x40) !== 0,
      connection,
    };

    const now = e.timeStamp;
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = now;

    this.state = state;
    this.onReport?.(state, dt);
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(...chunks: ArrayLike<number>[]) {
  let crc = 0xffffffff;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) crc = CRC_TABLE[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
