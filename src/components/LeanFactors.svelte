<script>
  // ── Turn-in Agility (qualitative model) ───────────────────────
  // Not exact physics — a teaching model of the factors from the
  // notes that govern how fast a bike will flick onto its side.
  //   • gyroscopic load (wheels + engine spinning) → resists leaning
  //   • rake angle steepness → more counter-steer leverage
  //   • wheelbase length → lateral leverage
  // Each slider is 0..1, framed low→high agility.

  let gyro = $state(0.6);       // 0 = spun down (braked, throttle off), 1 = high
  let rake = $state(0.5);       // 0 = raked-out/lazy, 1 = steep
  let wheelbase = $state(0.5);  // 0 = long, 1 = short

  // agility: low gyro is good, steep rake good, short wheelbase good
  let agility = $derived(
    Math.round((0.45 * (1 - gyro) + 0.30 * rake + 0.25 * wheelbase) * 100)
  );

  let verdict = $derived(
    agility >= 75 ? 'Flicks in hard — race setup, brakes loaded, engine settled.'
    : agility >= 50 ? 'Reasonable turn-in. Shed more gyro to sharpen it.'
    : agility >= 30 ? 'Lazy. The bike resists changing direction.'
    : 'Stubborn — high gyro load and lazy geometry fight every input.'
  );

  // gauge needle angle: -90deg (left) .. +90deg (right)
  let angle = $derived(-90 + (agility / 100) * 180);

  const factors = $derived([
    { key: 'gyro', label: 'Gyroscopic load', lo: 'Spun down', hi: 'High RPM', val: gyro,
      note: 'Brake hard + roll off throttle to bleed wheel & engine gyro.' },
    { key: 'rake', label: 'Rake steepness', lo: 'Raked out', hi: 'Steep', val: rake,
      note: 'Steeper rake = more counter-steer leverage, quicker flick.' },
    { key: 'wheelbase', label: 'Wheelbase', lo: 'Long', hi: 'Short', val: wheelbase,
      note: 'Shorter wheelbase = less lateral leverage to overcome.' },
  ]);

  function set(key, v) {
    if (key === 'gyro') gyro = v;
    if (key === 'rake') rake = v;
    if (key === 'wheelbase') wheelbase = v;
  }
</script>

<div class="grid sm:grid-cols-[180px_1fr] gap-6 items-center">
  <!-- gauge -->
  <div class="mx-auto">
    <svg viewBox="0 0 180 110" width="180" height="110">
      <!-- arc -->
      <path d="M 18 100 A 72 72 0 0 1 162 100" fill="none" stroke="var(--color-rule)" stroke-width="2" />
      <!-- tick marks -->
      {#each [0, 0.25, 0.5, 0.75, 1] as t}
        <line
          x1={90 + 64 * Math.cos(Math.PI - t * Math.PI)}
          y1={100 - 64 * Math.sin(Math.PI - t * Math.PI)}
          x2={90 + 72 * Math.cos(Math.PI - t * Math.PI)}
          y2={100 - 72 * Math.sin(Math.PI - t * Math.PI)}
          stroke="var(--color-ink-faint)" stroke-width="1.5"
        />
      {/each}
      <!-- needle (angle measured from vertical: -90 = left, +90 = right) -->
      <line x1="90" y1="100"
        x2={90 + 60 * Math.sin((Math.PI / 180) * angle)}
        y2={100 - 60 * Math.cos((Math.PI / 180) * angle)}
        stroke="var(--color-racing)" stroke-width="2.5" />
      <circle cx="90" cy="100" r="4" fill="var(--color-ink)" />
    </svg>
    <div class="text-center -mt-2">
      <div class="num">{agility}</div>
      <div class="label">Turn-in index</div>
    </div>
  </div>

  <!-- factors -->
  <div class="space-y-4">
    {#each factors as f}
      <div>
        <div class="flex justify-between items-baseline mb-1">
          <span class="label">{f.label}</span>
          <span class="label">{f.lo} ↔ {f.hi}</span>
        </div>
        <input type="range" min="0" max="1" step="0.01" value={f.val}
          on:input={(e) => set(f.key, +e.currentTarget.value)} class="w-full" />
        <p class="note">{f.note}</p>
      </div>
    {/each}

    <div class="verdict">{verdict}</div>
  </div>
</div>

<style>
  input[type="range"] { width: 100%; accent-color: var(--color-blueprint); }
  .num {
    font-family: var(--font-mono);
    font-size: 2rem;
    font-weight: 600;
    color: var(--color-ink);
    line-height: 1;
  }
  .note {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--color-ink-faint);
    margin-top: 0.2rem;
    line-height: 1.4;
  }
  .verdict {
    font-family: var(--font-mono);
    font-size: 0.74rem;
    border: 1px solid var(--color-rule);
    border-left: 3px solid var(--color-blueprint);
    padding: 0.5rem 0.7rem;
    color: var(--color-ink-soft);
    background: var(--color-card);
  }
</style>
