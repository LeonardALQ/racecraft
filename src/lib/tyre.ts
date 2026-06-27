/**
 * tyre.ts — physically grounded tyre-grip model for the Traction Budget.
 *
 * The model is built in three additive tiers, mirroring the manual:
 *   Tier 1  isotropic friction circle
 *   Tier 2  friction ellipse + load sensitivity + camber thrust   (added in Task 4)
 *   Tier 3  Pacejka Magic Formula + dynamic load transfer         (added in Task 5)
 *
 * Primary sources (no Wikipedia):
 *  - Pacejka, H.B. (2006). Tire and Vehicle Dynamics, 2nd ed. SAE. ISBN 0-7680-1702-5.
 *  - Cossalter, V. (2006). Motorcycle Dynamics, 2nd ed. ISBN 978-1-4303-0861-4.
 *  - Milliken, W.F. & Milliken, D.L. (1995). Race Car Vehicle Dynamics. SAE.
 *  - Foale, T. (2006). Motorcycle Handling and Chassis Design, 2nd ed.
 *  - Wong, J.Y. (2008). Theory of Ground Vehicles, 2nd ed. Wiley.
 */

export const G = 9.81; // m/s^2

// ─────────────────────────────────────────────────────────────────────────
// TIER 1 — the isotropic friction circle
// The tyre has a single grip budget. Longitudinal (Fx) and lateral (Fy)
// demands combine as a vector; the resultant may not exceed the limit Fmax.
//   (Fx/Fmax)^2 + (Fy/Fmax)^2 <= 1     (Pacejka 2006, p.5 — the friction circle)
// Fmax = mu * Fz.
// ─────────────────────────────────────────────────────────────────────────

/** Maximum horizontal force a tyre can produce under Coulomb assumption. */
export function maxForce(mu: number, Fz: number): number {
  return mu * Fz;
}

/**
 * Grip usage as a fraction of the circular limit: |F| / Fmax.
 * <= 1 is within budget, > 1 has exceeded available grip.
 * Inputs may be raw forces (N) or already-normalised fractions (with Fmax = 1).
 */
export function frictionCircle(fx: number, fy: number, fMax = 1): number {
  return Math.hypot(fx, fy) / fMax;
}

/** Convenience predicate for the circular limit (small tolerance for FP). */
export function isWithinLimit(usage: number, tol = 1e-9): boolean {
  return usage <= 1 + tol;
}

// ─────────────────────────────────────────────────────────────────────────
// TIER 2 — the friction ELLIPSE (longitudinal and lateral limits differ)
//   (Fx/Fx,max)^2 + (Fy/Fy,max)^2 <= 1
//   (Pacejka 2006; Foale 2006, pp.2-29; Wong 2008, pp.52-53)
// Load sensitivity and camber thrust are added in Task 4.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Grip usage against an elliptical limit. The circle is the special case
 * fxMax === fyMax. <= 1 within budget.
 */
export function frictionEllipse(
  fx: number,
  fy: number,
  fxMax: number,
  fyMax: number,
): number {
  return Math.hypot(fx / fxMax, fy / fyMax);
}

// ─────────────────────────────────────────────────────────────────────────
// TIER 2 — load sensitivity & camber thrust
//
// Load sensitivity (Milliken & Milliken 1995, "Race Car Vehicle Dynamics",
// Fig. 2.9): the friction coefficient FALLS as vertical load rises, so the
// peak lateral force Fy,max = mu(Fz)*Fz keeps increasing but at a DIMINISHING
// rate. A first-order linear model captures this:
//        mu(Fz) = mu0 - k * Fz,     k > 0
// Milliken Fig 2.9 (Fy/Fz)max:  1.10 @ 900 lbf, 1.08 @ 1350, 0.97 @ 1800.
// Fitting the endpoints gives mu0 ≈ 1.23, k ≈ 1.444e-4 / lbf.
// ─────────────────────────────────────────────────────────────────────────

/** Milliken & Milliken (1995) Fig. 2.9 calibration, in lbf. */
export const MILLIKEN_FIG_2_9 = [
  { Fz: 900, muMax: 1.10, slipDeg: 5.6 },
  { Fz: 1350, muMax: 1.08, slipDeg: 6.0 },
  { Fz: 1800, muMax: 0.97, slipDeg: 6.7 },
] as const;

/** Linear load-sensitivity fit to the Milliken endpoints (units: lbf). */
export const LOAD_SENS_FIT = { mu0: 1.23, k: 1.4444e-4 } as const;

/**
 * Friction coefficient as a function of vertical load (load sensitivity).
 * mu decreases linearly with Fz. Clamped to stay positive.
 */
export function loadSensitivity(mu0: number, k: number, Fz: number): number {
  return Math.max(0, mu0 - k * Fz);
}

/** Peak lateral (or longitudinal) force given load sensitivity: mu(Fz)*Fz. */
export function peakForce(mu0: number, k: number, Fz: number): number {
  return loadSensitivity(mu0, k, Fz) * Fz;
}

/**
 * Elliptical grip limits for a given vertical load, with separate
 * longitudinal / lateral capability ratios (anisotropy). Defaults reflect a
 * sport tyre whose lateral capability slightly exceeds longitudinal
 * (Foale 2006; Pacejka 2006).
 */
export function ellipseLimits(
  Fz: number,
  { mu0, k }: { mu0: number; k: number } = LOAD_SENS_FIT,
  longRatio = 0.95,
  latRatio = 1.0,
): { fxMax: number; fyMax: number; mu: number } {
  const mu = loadSensitivity(mu0, k, Fz);
  const base = mu * Fz;
  return { fxMax: base * longRatio, fyMax: base * latRatio, mu };
}

/**
 * Camber thrust: a leaned (cambered) tyre produces lateral force from camber
 * angle gamma in addition to slip-angle force (Pacejka 2006; Cossalter 2006).
 *   Fy ≈ C_alpha * alpha + C_gamma * gamma      (small-angle, linear range)
 * Angles in radians; stiffnesses in N/rad.
 */
export function lateralForce(
  cAlpha: number,
  alpha: number,
  cGamma: number,
  gamma: number,
): number {
  return cAlpha * alpha + cGamma * gamma;
}

// ─────────────────────────────────────────────────────────────────────────
// TIER 3 — Pacejka Magic Formula & dynamic load transfer
//
// Pacejka (2006), "Tire and Vehicle Dynamics": a single empirical curve fits
// longitudinal force vs slip ratio kappa and lateral force vs slip angle alpha:
//   F(s) = Fz * D * sin( C * arctan( B*s - E*(B*s - arctan(B*s)) ) )
// B = stiffness, C = shape, D = peak factor (~mu), E = curvature.
//
// Dynamic load transfer (longitudinal): under acceleration a_x the vertical
// load shifts between axles by m*a_x*h/L, where h = CoG height, L = wheelbase.
//   (Milliken & Milliken 1995; Cossalter 2006)
// ─────────────────────────────────────────────────────────────────────────

export interface MagicCoeffs {
  B: number; // stiffness factor
  C: number; // shape factor
  D: number; // peak factor (~ friction coefficient)
  E: number; // curvature factor
}

/** Representative normalised Magic Formula coefficients (Pacejka 2006). */
export const PACEJKA_TYPICAL: MagicCoeffs = { B: 10, C: 1.65, D: 1.0, E: 0.97 };

/**
 * Pacejka Magic Formula. `slip` is slip ratio (longitudinal) or slip angle in
 * radians (lateral). Returns force in the same units as Fz.
 */
export function magicForce(
  { B, C, D, E }: MagicCoeffs,
  slip: number,
  Fz: number,
): number {
  const Bs = B * slip;
  return Fz * D * Math.sin(C * Math.atan(Bs - E * (Bs - Math.atan(Bs))));
}

/**
 * Dynamic longitudinal load transfer.
 * @param m   total mass (kg)
 * @param ax  longitudinal acceleration (m/s^2); +forward (accel), -braking
 * @param h   centre-of-gravity height (m)
 * @param L   wheelbase (m)
 * @param b   distance from CoG to the REAR axle (m); default L/2 (centred)
 * Sign: accelerating (ax>0) shifts load rearward; braking (ax<0) shifts it forward.
 */
export function loadTransfer(
  m: number,
  ax: number,
  h: number,
  L: number,
  b: number = L / 2,
): { deltaFz: number; FzFront: number; FzRear: number } {
  const a = L - b; // distance from CoG to front axle
  const deltaFz = (m * ax * h) / L; // +ve shifts to rear
  const FzFront = (m * G * b) / L - deltaFz;
  const FzRear = (m * G * a) / L + deltaFz;
  return { deltaFz, FzFront, FzRear };
}
