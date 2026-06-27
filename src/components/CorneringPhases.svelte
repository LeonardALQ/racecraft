<script>
  // ── Cornering Phases ──────────────────────────────────────────
  // Maps corner progress (0 = entry, 0.5 = apex, 1 = exit) to the
  // three inputs, following the technique notes:
  //   entry: brake 100 / throttle 0 / lean rising
  //   trail: brake ↓ lean ↑
  //   apex:  lean ~100, brake 0, throttle takes up the slack
  //   drive: lean ↓ throttle ↑

  let p = $state(0);        // 0..1 corner progress
  let playing = $state(false);
  let raf;

  const clamp = (v) => Math.max(0, Math.min(1, v));

  // input model
  let brake = $derived(clamp(1 - p / 0.45));                 // 100% → 0 at p=0.45
  let lean = $derived(p <= 0.5 ? clamp(p / 0.5) : clamp(1 - (p - 0.5) / 0.5));
  let throttle = $derived(
    p < 0.45 ? 0
    : p < 0.5 ? ((p - 0.45) / 0.05) * 0.12      // "take up the slack"
    : 0.12 + ((p - 0.5) / 0.5) * 0.88           // drive out
  );

  // tie back to the traction budget: longitudinal vs lateral demand
  let longitudinal = $derived(Math.max(brake, throttle));
  let grip = $derived(Math.sqrt(longitudinal * longitudinal + lean * lean));
  let over = $derived(grip > 1.02);

  let phase = $derived(
    p < 0.04 ? 'ENTRY'
    : brake > 0.02 && lean < 0.99 ? 'TRAIL-BRAKING'
    : Math.abs(p - 0.5) < 0.08 ? 'APEX'
    : p < 0.5 ? 'TRAIL-BRAKING'
    : 'DRIVE OUT'
  );

  function tick() {
    p += 0.006;
    if (p >= 1) { p = 1; playing = false; return; }
    raf = requestAnimationFrame(tick);
  }
  function toggle() {
    playing = !playing;
    if (playing) { if (p >= 1) p = 0; raf = requestAnimationFrame(tick); }
    else cancelAnimationFrame(raf);
  }

  const pc = (v) => Math.round(v * 100);

  const bars = $derived([
    { name: 'Brake', v: brake, color: 'var(--color-racing)' },
    { name: 'Lean', v: lean, color: 'var(--color-blueprint)' },
    { name: 'Throttle', v: throttle, color: 'var(--color-amber)' },
  ]);
</script>

<div class="space-y-5">
  <!-- phase strip -->
  <div class="flex items-center justify-between">
    <div class="phase">{phase}</div>
    <div class="label">Grip used:
      <span class="font-semibold" style:color={over ? 'var(--color-racing)' : 'var(--color-ink)'}>
        {pc(grip)}%
      </span>
    </div>
  </div>

  <!-- bars -->
  <div class="space-y-3">
    {#each bars as b}
      <div class="flex items-center gap-3">
        <span class="label w-20 shrink-0">{b.name}</span>
        <div class="bar-track">
          <div class="bar-fill" style:width="{pc(b.v)}%" style:background={b.color}></div>
        </div>
        <span class="bar-num">{pc(b.v)}%</span>
      </div>
    {/each}
  </div>

  <!-- progress track with apex marker -->
  <div class="pt-1">
    <div class="relative">
      <input type="range" min="0" max="1" step="0.001" bind:value={p} class="w-full" />
    </div>
    <div class="flex justify-between label mt-1">
      <span>Entry</span>
      <span style:color="var(--color-blueprint)">Apex</span>
      <span>Exit</span>
    </div>
  </div>

  <div class="flex items-center gap-3">
    <button class="play" on:click={toggle}>
      {playing ? '❚❚ Pause' : '▶ Run the corner'}
    </button>
    <button class="play ghost" on:click={() => { playing = false; cancelAnimationFrame(raf); p = 0; }}>
      ↺ Reset
    </button>
  </div>
</div>

<style>
  .phase {
    font-family: var(--font-mono);
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--color-ink);
    border-left: 3px solid var(--color-racing);
    padding-left: 0.6rem;
  }
  .bar-track {
    flex: 1;
    height: 18px;
    background: var(--color-card);
    border: 1px solid var(--color-rule);
    position: relative;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    transition: width 0.05s linear;
    opacity: 0.85;
  }
  .bar-num {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    width: 3rem;
    text-align: right;
    color: var(--color-ink-soft);
  }
  input[type="range"] { width: 100%; accent-color: var(--color-ink); }

  .play {
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    border: 1px solid var(--color-ink);
    background: var(--color-ink);
    color: var(--color-paper);
    padding: 0.4rem 0.8rem;
    cursor: pointer;
  }
  .play.ghost {
    background: var(--color-card);
    color: var(--color-ink-soft);
    border-color: var(--color-rule);
  }
  .play:hover { opacity: 0.88; }
</style>
