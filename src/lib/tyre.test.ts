import { describe, it, expect } from 'vitest';
import {
  maxForce,
  frictionCircle,
  isWithinLimit,
  frictionEllipse,
} from './tyre';

describe('Tier 1 — friction circle', () => {
  it('maxForce = mu * Fz', () => {
    expect(maxForce(1.0, 3000)).toBe(3000);
    expect(maxForce(0.9, 2000)).toBeCloseTo(1800, 6);
  });

  it('70% brake + 70% lean is within the limit (sum of squares = 0.98)', () => {
    const usage = frictionCircle(0.7, 0.7, 1);
    // c^2 = 0.49 + 0.49 = 0.98  ->  c = 0.9899
    expect(usage * usage).toBeCloseTo(0.98, 6);
    expect(usage).toBeCloseTo(0.98995, 4);
    expect(isWithinLimit(usage)).toBe(true);
  });

  it('80% brake + 80% lean exceeds the limit', () => {
    const usage = frictionCircle(0.8, 0.8, 1);
    expect(usage).toBeGreaterThan(1);
    expect(isWithinLimit(usage)).toBe(false);
  });

  it('pure single-axis demand equals that demand', () => {
    expect(frictionCircle(1.0, 0, 1)).toBeCloseTo(1, 9);
    expect(frictionCircle(0, 0.5, 1)).toBeCloseTo(0.5, 9);
  });

  it('works with raw forces and a real Fmax', () => {
    const fMax = maxForce(1.0, 3000); // 3000 N
    expect(frictionCircle(2100, 2100, fMax)).toBeCloseTo(0.98995, 4);
  });
});

describe('Tier 2 — friction ellipse (skeleton)', () => {
  it('reduces to the circle when fxMax === fyMax', () => {
    expect(frictionEllipse(0.7, 0.7, 1, 1)).toBeCloseTo(frictionCircle(0.7, 0.7, 1), 9);
  });

  it('an asymmetric tyre tolerates more lateral than longitudinal', () => {
    // fyMax > fxMax: same lateral force costs a smaller fraction of budget
    const usageLat = frictionEllipse(0, 1000, 3000, 3600);
    const usageLong = frictionEllipse(1000, 0, 3000, 3600);
    expect(usageLat).toBeLessThan(usageLong);
  });
});

import {
  loadSensitivity,
  peakForce,
  ellipseLimits,
  lateralForce,
  MILLIKEN_FIG_2_9,
  LOAD_SENS_FIT,
} from './tyre';

describe('Tier 2 — load sensitivity (Milliken & Milliken 1995, Fig. 2.9)', () => {
  const { mu0, k } = LOAD_SENS_FIT;

  it('mu decreases monotonically as vertical load increases', () => {
    const mu900 = loadSensitivity(mu0, k, 900);
    const mu1350 = loadSensitivity(mu0, k, 1350);
    const mu1800 = loadSensitivity(mu0, k, 1800);
    expect(mu900).toBeGreaterThan(mu1350);
    expect(mu1350).toBeGreaterThan(mu1800);
  });

  it('reproduces the Milliken Fig 2.9 (Fy/Fz)max trend within tolerance', () => {
    for (const row of MILLIKEN_FIG_2_9) {
      const mu = loadSensitivity(mu0, k, row.Fz);
      expect(mu).toBeCloseTo(row.muMax, 1); // within ~0.05
    }
  });

  it('peak lateral force still RISES with load but at a DIMINISHING rate', () => {
    const f900 = peakForce(mu0, k, 900);
    const f1350 = peakForce(mu0, k, 1350);
    const f1800 = peakForce(mu0, k, 1800);
    // increasing
    expect(f1350).toBeGreaterThan(f900);
    expect(f1800).toBeGreaterThan(f1350);
    // diminishing returns: second increment smaller than the first (concave)
    expect(f1800 - f1350).toBeLessThan(f1350 - f900);
  });

  it('the Milliken data itself shows the same diminishing-returns behaviour', () => {
    const fy = MILLIKEN_FIG_2_9.map((r) => r.muMax * r.Fz);
    expect(fy[1]).toBeGreaterThan(fy[0]);
    expect(fy[2]).toBeGreaterThan(fy[1]);
    expect(fy[2] - fy[1]).toBeLessThan(fy[1] - fy[0]);
  });
});

describe('Tier 2 — ellipse limits & camber thrust', () => {
  it('ellipse limits shrink (per-unit-load) as load rises (load sensitivity)', () => {
    const lo = ellipseLimits(900);
    const hi = ellipseLimits(1800);
    expect(hi.mu).toBeLessThan(lo.mu);
    // absolute lateral capacity still grows with load
    expect(hi.fyMax).toBeGreaterThan(lo.fyMax);
  });

  it('camber thrust adds lateral force from lean even at zero slip angle', () => {
    const cAlpha = 60000, cGamma = 8000;
    const noCamber = lateralForce(cAlpha, 0.05, cGamma, 0);
    const withCamber = lateralForce(cAlpha, 0.05, cGamma, 0.3);
    expect(withCamber).toBeGreaterThan(noCamber);
    expect(lateralForce(cAlpha, 0, cGamma, 0.3)).toBeCloseTo(cGamma * 0.3, 6);
  });
});

import { magicForce, loadTransfer, PACEJKA_TYPICAL, G } from './tyre';

describe('Tier 3 — Pacejka Magic Formula', () => {
  const Fz = 3000;

  it('produces zero force at zero slip', () => {
    expect(magicForce(PACEJKA_TYPICAL, 0, Fz)).toBeCloseTo(0, 9);
  });

  it('is an odd function (sign symmetric)', () => {
    const f = magicForce(PACEJKA_TYPICAL, 0.1, Fz);
    expect(magicForce(PACEJKA_TYPICAL, -0.1, Fz)).toBeCloseTo(-f, 6);
  });

  it('has an interior peak ~= Fz*D, then falls off (combined-slip shape)', () => {
    let peak = 0, peakSlip = 0;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const fAbs = Math.abs(magicForce(PACEJKA_TYPICAL, s, Fz));
      if (fAbs > peak) { peak = fAbs; peakSlip = s; }
    }
    // peak occurs at a positive slip (not at the extremes)
    expect(peakSlip).toBeGreaterThan(0);
    expect(peakSlip).toBeLessThan(1);
    // peak magnitude is close to the peak factor Fz*D
    expect(peak).toBeGreaterThan(0.95 * Fz * PACEJKA_TYPICAL.D);
    expect(peak).toBeLessThanOrEqual(Fz * PACEJKA_TYPICAL.D + 1e-6);
    // falls off past the peak
    const past = Math.abs(magicForce(PACEJKA_TYPICAL, 1.0, Fz));
    expect(past).toBeLessThan(peak);
  });

  it('scales linearly with vertical load', () => {
    expect(magicForce(PACEJKA_TYPICAL, 0.1, 6000)).toBeCloseTo(
      2 * magicForce(PACEJKA_TYPICAL, 0.1, 3000), 6);
  });
});

describe('Tier 3 — dynamic load transfer', () => {
  const m = 250, h = 0.6, L = 1.4; // bike + rider

  it('conserves total vertical load (FzFront + FzRear = m*g)', () => {
    const { FzFront, FzRear } = loadTransfer(m, -8, h, L);
    expect(FzFront + FzRear).toBeCloseTo(m * G, 6);
  });

  it('braking shifts load onto the front; acceleration onto the rear', () => {
    const stat = loadTransfer(m, 0, h, L);
    const brake = loadTransfer(m, -8, h, L);
    const accel = loadTransfer(m, 8, h, L);
    expect(brake.FzFront).toBeGreaterThan(stat.FzFront);
    expect(accel.FzFront).toBeLessThan(stat.FzFront);
    expect(brake.FzRear).toBeLessThan(stat.FzRear);
  });

  it('transfer magnitude is m*ax*h/L', () => {
    const { deltaFz } = loadTransfer(m, 8, h, L);
    expect(deltaFz).toBeCloseTo((m * 8 * h) / L, 6);
  });
});
