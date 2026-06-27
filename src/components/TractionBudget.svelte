<script>
  // Traction Budget — a simulation built on src/lib/tyre.ts. The three modes
  // mirror the additive math tiers:
  //   circle   (Tier 1) isotropic friction circle, draggable demand
  //   ellipse  (Tier 2) friction ellipse + load-sensitivity slider + camber
  //   combined (Tier 3) Pacejka combined slip + dynamic load transfer
  // Physics functions are imported; nothing is re-derived here.
  import {
    loadSensitivity, ellipseLimits, frictionEllipse, frictionCircle,
    magicForce, loadTransfer, lateralForce, PACEJKA_TYPICAL, G,
  } from '../lib/tyre';

  // Illustrative SI calibration for the sim (the module is unit-agnostic;
  // the lbf Milliken calibration lives in the unit tests).
  const SENS = { mu0: 1.35, k: 1.0e-4 };       // mu(Fz)=1.35-1e-4*Fz  (per N)
  const LAT = { B: 8, C: 1.3, D: 1.05, E: 0.97 }; // lateral Magic Formula coeffs
  const m = 250, h = 0.6, L = 1.4;             // bike+rider (kg, m, m)

  const SIZE = 300, cx = 150, cy = 150;
  const PX_PER_N = 0.04;                        // force -> pixels

  let { initialMode = 'circle', showModes = true } = $props();
  let mode = $state(initialMode);

  // ── shared demand (circle/ellipse modes are draggable) ──
  let Fx = $state(700);   // longitudinal N (+brake / -throttle)
  let Fy = $state(700);   // lateral N (lean), >= 0 shown to the right

  // ── ellipse mode ──
  let Fz = $state(1500);  // vertical load slider (N)
  let camber = $state(0); // camber angle (rad)

  // ── combined mode ──
  let kappa = $state(0.06); // slip ratio
  let alpha = $state(0.10); // slip angle (rad)
  let ax = $state(-6);      // long. accel (m/s^2): -brake / +throttle

  // static front load (centred) for circle mode reference
  const Fz0 = (m * G) / 2;

  // ----- derived limit + node per mode -----
  let lim = $derived.by(() => {
    if (mode === 'circle') {
      const mu = loadSensitivity(SENS.mu0, SENS.k, Fz0);
      const r = mu * Fz0;
      return { fxMax: r, fyMax: r, mu, Fz: Fz0, circle: true };
    }
    if (mode === 'ellipse') {
      const e = ellipseLimits(Fz, SENS);
      return { ...e, Fz, circle: false };
    }
    // combined: front tyre under load transfer
    const lt = loadTransfer(m, ax, h, L);
    const e = ellipseLimits(lt.FzFront, SENS);
    return { ...e, Fz: lt.FzFront, lt, circle: false };
  });

  // demand forces per mode
  let demand = $derived.by(() => {
    if (mode === 'combined') {
      const fx = magicForce(PACEJKA_TYPICAL, kappa, lim.Fz);
      const fy = magicForce(LAT, alpha, lim.Fz);
      return { fx, fy };
    }
    // camber thrust adds lateral force "for free" in ellipse mode
    const camThrust = mode === 'ellipse' ? lateralForce(0, 0, 0.18 * lim.Fz, camber) : 0;
    return { fx: Fx, fy: Fy + camThrust, camThrust };
  });

  let usage = $derived(
    frictionEllipse(demand.fx, demand.fy, lim.fxMax, lim.fyMax)
  );
  let over = $derived(usage > 1.0001);

  // svg geometry
  let rxPx = $derived(lim.fyMax * PX_PER_N); // lateral -> horizontal
  let ryPx = $derived(lim.fxMax * PX_PER_N); // longitudinal -> vertical
  let nodeX = $derived(cx + demand.fy * PX_PER_N);
  let nodeY = $derived(cy - demand.fx * PX_PER_N);

  // ----- drag (circle/ellipse only) -----
  let dragging = $state(false);
  let svgEl;
  function setFromPoint(clientX, clientY) {
    const r = svgEl.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * SIZE;
    const py = ((clientY - r.top) / r.height) * SIZE;
    Fy = Math.max(0, (px - cx) / PX_PER_N);
    Fx = (cy - py) / PX_PER_N;
  }
  function onDown(e) {
    if (mode === 'combined') return;
    dragging = true;
    const t = e.touches ? e.touches[0] : e;
    setFromPoint(t.clientX, t.clientY);
  }
  function onMove(e) {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    setFromPoint(t.clientX, t.clientY);
    if (e.touches) e.preventDefault();
  }
  function onUp() { dragging = false; }

  const N = (v) => Math.round(v);
  const pct = (v) => Math.round(v * 100);
  const deg = (r) => Math.round((r * 180) / Math.PI);
</script>

<svelte:window on:pointermove={onMove} on:pointerup={onUp} />

<div class="tb">
  <!-- mode selector -->
  {#if showModes}
  <div class="modes">
    <button class:active={mode === 'circle'} on:click={() => (mode = 'circle')}>1 · Circle</button>
    <button class:active={mode === 'ellipse'} on:click={() => (mode = 'ellipse')}>2 · Ellipse + load</button>
    <button class:active={mode === 'combined'} on:click={() => (mode = 'combined')}>3 · Combined slip</button>
  </div>
  {/if}

  <div class="grid">
    <!-- diagram -->
    <div class="diag">
      <svg bind:this={svgEl} viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}
        class:draggable={mode !== 'combined'} on:pointerdown={onDown} role="img"
        aria-label="Traction budget diagram">
        <line x1={cx} y1="12" x2={cx} y2={SIZE - 12} stroke="var(--color-grid)" />
        <line x1="12" y1={cy} x2={SIZE - 12} y2={cy} stroke="var(--color-grid)" />

        <!-- limit curve -->
        <ellipse cx={cx} cy={cy} rx={rxPx} ry={ryPx} fill="none"
          stroke={over ? 'var(--color-racing)' : 'var(--color-blueprint)'} stroke-width="1.75" />

        <!-- resultant + node -->
        <line x1={cx} y1={cy} x2={nodeX} y2={nodeY}
          stroke={over ? 'var(--color-racing)' : 'var(--color-ink)'} stroke-width="1.5" />
        <circle cx={nodeX} cy={nodeY} r="6.5"
          fill={over ? 'var(--color-racing)' : 'var(--color-ink)'} stroke="var(--color-card)" stroke-width="2" />

        <text x={cx + 4} y="20" class="lbl">BRAKE</text>
        <text x={cx + 4} y={SIZE - 6} class="lbl">THROTTLE</text>
        <text x={SIZE - 6} y={cy - 5} text-anchor="end" class="lbl">LEAN ▸</text>
      </svg>
    </div>

    <!-- readouts + controls -->
    <div class="panel">
      <div class="reads">
        <div class="read"><div class="k">Long. F<sub>x</sub></div><div class="v">{N(demand.fx)}<u>N</u></div></div>
        <div class="read"><div class="k">Lat. F<sub>y</sub></div><div class="v">{N(demand.fy)}<u>N</u></div></div>
        <div class="read" class:over><div class="k">Grip used</div><div class="v">{pct(usage)}<u>%</u></div></div>
      </div>

      <div class="reads sub">
        <div class="read2"><span class="k">μ(F_z)</span> <span>{lim.mu.toFixed(2)}</span></div>
        <div class="read2"><span class="k">F_z</span> <span>{N(lim.Fz)} N</span></div>
        <div class="read2"><span class="k">limit Fy</span> <span>{N(lim.fyMax)} N</span></div>
      </div>

      <div class="status" class:over>
        {#if over}
          ▲ OVER THE LIMIT — demand exceeds the {lim.circle ? 'circle' : 'ellipse'}. Tyre lets go.
        {:else if mode === 'circle'}
          ◆ Tier 1: isotropic circle, radius μ·F_z = {N(lim.fxMax)} N. Drag the node.
        {:else if mode === 'ellipse'}
          ◆ Tier 2: raise F_z and watch μ fall (load sensitivity) — the ellipse grows but
          not proportionally. Camber adds {N(demand.camThrust ?? 0)} N of lateral.
        {:else}
          ◆ Tier 3: κ and α set the forces via the Magic Formula; braking transfers load to
          the front (F_z = {N(lim.Fz)} N), reshaping its ellipse live.
        {/if}
      </div>

      <!-- per-mode controls -->
      {#if mode === 'circle' || mode === 'ellipse'}
        <label class="ctl"><span class="k">Brake (+) / Throttle (−)</span>
          <input type="range" min={-lim.fxMax} max={lim.fxMax} step="10" bind:value={Fx} /></label>
        <label class="ctl"><span class="k">Lean (lateral)</span>
          <input type="range" min="0" max={lim.fyMax} step="10" bind:value={Fy} /></label>
      {/if}
      {#if mode === 'ellipse'}
        <label class="ctl"><span class="k">Vertical load F_z — {N(Fz)} N</span>
          <input type="range" min="600" max="3400" step="20" bind:value={Fz} /></label>
        <label class="ctl"><span class="k">Camber (lean) γ — {deg(camber)}°</span>
          <input type="range" min="0" max="0.9" step="0.01" bind:value={camber} /></label>
      {/if}
      {#if mode === 'combined'}
        <label class="ctl"><span class="k">Slip ratio κ — {kappa.toFixed(2)}</span>
          <input type="range" min="-0.2" max="0.2" step="0.005" bind:value={kappa} /></label>
        <label class="ctl"><span class="k">Slip angle α — {deg(alpha)}°</span>
          <input type="range" min="-0.3" max="0.3" step="0.005" bind:value={alpha} /></label>
        <label class="ctl"><span class="k">Long. accel a_x — {ax.toFixed(1)} m/s² ({ax < 0 ? 'braking' : 'drive'})</span>
          <input type="range" min="-9" max="9" step="0.2" bind:value={ax} /></label>
      {/if}
    </div>
  </div>
</div>

<style>
  .tb { font-size: 0.9rem; }
  .modes { display: flex; gap: 0.4rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
  .modes button {
    font-family: var(--font-mono); font-size: 0.66rem; letter-spacing: 0.03em;
    border: 1px solid var(--color-rule); background: var(--color-card);
    color: var(--color-ink-soft); padding: 0.3rem 0.6rem; cursor: pointer;
  }
  .modes button.active { background: var(--color-ink); color: var(--color-paper); border-color: var(--color-ink); }
  .grid { display: grid; grid-template-columns: 300px 1fr; gap: 1.2rem; align-items: start; }
  @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  .diag { max-width: 300px; }
  svg { display: block; width: 100%; height: auto; touch-action: none; }
  svg.draggable { cursor: pointer; }
  .lbl { font-family: var(--font-mono); font-size: 8px; letter-spacing: 0.12em; fill: var(--color-ink-faint); }

  .reads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
  .read { border: 1px solid var(--color-rule); background: var(--color-card); padding: 0.4rem 0.5rem; }
  .read.over { border-color: var(--color-racing); }
  .read .k { font-family: var(--font-mono); font-size: 0.58rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-ink-faint); }
  .read .v { font-family: var(--font-mono); font-size: 1.2rem; font-weight: 600; color: var(--color-ink); line-height: 1.2; }
  .read.over .v { color: var(--color-racing); }
  .read .v u { font-size: 0.65rem; text-decoration: none; color: var(--color-ink-faint); margin-left: 1px; }

  .sub { grid-template-columns: repeat(3, 1fr); margin-top: 0.5rem; }
  .read2 { font-family: var(--font-mono); font-size: 0.66rem; color: var(--color-ink-soft); display: flex; justify-content: space-between; border-bottom: 1px solid var(--color-rule); padding: 0.15rem 0; }
  .read2 .k { color: var(--color-ink-faint); }

  .status {
    font-family: var(--font-mono); font-size: 0.7rem; line-height: 1.5;
    padding: 0.5rem 0.6rem; margin: 0.7rem 0; border: 1px solid var(--color-rule);
    background: color-mix(in srgb, var(--color-blueprint) 8%, var(--color-card)); color: var(--color-ink-soft);
  }
  .status.over { border-color: var(--color-racing); background: color-mix(in srgb, var(--color-racing) 10%, var(--color-card)); color: var(--color-racing); }

  .ctl { display: block; margin: 0.5rem 0; }
  .ctl .k { display: block; font-family: var(--font-mono); font-size: 0.62rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-ink-faint); margin-bottom: 0.2rem; }
  input[type="range"] { width: 100%; accent-color: var(--color-racing); }
</style>
