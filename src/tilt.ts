import type { Vec3 } from './dualsense';

// Complementary filter on the gravity vector in the controller's frame.
// The gyro rotates the estimate (smooth, drifts); the accelerometer pulls it
// back toward measured gravity (noisy, absolute).
const ACCEL_TRUST = 0.02;

export class TiltEstimator {
  private g: Vec3 = [0, 1, 0];
  private neutral = { pitch: 0, roll: 0 };
  private initialised = false;

  update(accel: Vec3, gyro: Vec3, dt: number) {
    const a = normalise(accel);
    if (!a) return;
    if (!this.initialised) {
      this.g = a;
      this.initialised = true;
      return;
    }

    // dg/dt = -(w x g)
    const [gx, gy, gz] = this.g;
    const [wx, wy, wz] = gyro;
    const predicted: Vec3 = [
      gx - (wy * gz - wz * gy) * dt,
      gy - (wz * gx - wx * gz) * dt,
      gz - (wx * gy - wy * gx) * dt,
    ];

    const blended: Vec3 = [
      predicted[0] + (a[0] - predicted[0]) * ACCEL_TRUST,
      predicted[1] + (a[1] - predicted[1]) * ACCEL_TRUST,
      predicted[2] + (a[2] - predicted[2]) * ACCEL_TRUST,
    ];
    this.g = normalise(blended) ?? a;
  }

  // Store the current orientation as "level".
  calibrate() {
    this.neutral = this.rawAngles();
  }

  // Radians relative to the calibrated neutral pose.
  angles() {
    const raw = this.rawAngles();
    return {
      pitch: raw.pitch - this.neutral.pitch,
      roll: raw.roll - this.neutral.roll,
    };
  }

  // Controller held flat, face up: gravity reads along +Y.
  // X is left/right, Z is toward/away from the player.
  private rawAngles() {
    const [x, y, z] = this.g;
    return { pitch: Math.atan2(z, y), roll: Math.atan2(x, y) };
  }
}

function normalise([x, y, z]: Vec3): Vec3 | null {
  const len = Math.hypot(x, y, z);
  return len > 1e-6 ? [x / len, y / len, z / len] : null;
}
