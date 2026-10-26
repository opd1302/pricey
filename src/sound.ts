// Sound effects and background music, made in the browser with the Web Audio
// API, so there are no audio files to download or license. Browsers only allow
// sound after the player clicks or presses a key, so nothing plays until then.
// Players can turn music and effects off; the choice is remembered.

const SETTINGS_KEY = "pricey-sound";
const MUSIC_VOLUME = 0.32;

interface SoundSettings {
  effects: boolean;
  music: boolean;
}

let settings: SoundSettings = loadSettings();
let ctx: AudioContext | null = null;
let effectsBus: GainNode;
let musicBus: GainNode;
let noiseBuffer: AudioBuffer;
/** Whether this page wants background music at all. */
let pageWantsMusic = false;
let musicTimer: number | undefined;
let nextBarTime = 0;
let bar = 0;

// ---------- Setting up ----------

/** Call once per page. Sound starts on the player's first click or key press. */
export function initSound(options: { music: boolean }): void {
  pageWantsMusic = options.music;
  const unlock = () => {
    const c = audio();
    if (!c) return;
    void c.resume();
    if (pageWantsMusic && settings.music) startMusic();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  // Go quiet while the tab is in the background.
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  // Evens out the loudest moments so nothing distorts.
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter).connect(ctx.destination);
  effectsBus = gainTo(0.6, master);
  musicBus = gainTo(0, master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function gainTo(value: number, destination: AudioNode): GainNode {
  const gain = ctx!.createGain();
  gain.gain.value = value;
  gain.connect(destination);
  return gain;
}

// ---------- On/off buttons ----------

const ICONS = {
  music: (on: boolean) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" />${on ? "" : `<path d="M3 3l18 18" />`}</svg>`,
  effects: (on: boolean) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" />${on ? `<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />` : `<path d="m16 9 5 6M21 9l-5 6" />`}</svg>`,
};

/** Adds "Music" and "Sounds" on/off buttons to `container`. */
export function mountSoundControls(container: HTMLElement): void {
  const draw = () => {
    container.innerHTML = (["music", "effects"] as const)
      .filter((kind) => kind === "effects" || pageWantsMusic)
      .map((kind) => {
        const on = settings[kind];
        const label = kind === "music" ? "Music" : "Sound effects";
        return `<button class="sound-toggle" data-kind="${kind}" aria-pressed="${on}" title="${label} ${on ? "on" : "off"}" aria-label="${label}">${ICONS[kind](on)}</button>`;
      })
      .join("");
  };
  container.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".sound-toggle",
    );
    if (!button) return;
    const kind = button.dataset.kind as keyof SoundSettings;
    settings = { ...settings, [kind]: !settings[kind] };
    saveSettings();
    if (kind === "music") {
      if (settings.music && pageWantsMusic) {
        void audio()?.resume();
        startMusic();
      } else {
        stopMusic();
      }
    }
    draw();
  });
  draw();
}

// ---------- Building blocks ----------

interface ToneOptions {
  freq: number;
  /** Glide to this frequency over the note. */
  to?: number;
  type?: OscillatorType;
  duration: number;
  volume: number;
  attack?: number;
  delay?: number;
  bus?: GainNode;
  lowpass?: number;
}

function tone(o: ToneOptions): void {
  const c = ctx!;
  const t = c.currentTime + 0.01 + (o.delay ?? 0);
  toneAt(t, o);
}

function toneAt(t: number, o: ToneOptions): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(o.volume, t + (o.attack ?? 0.005));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = o.lowpass;
    node = node.connect(filter);
  }
  node.connect(gain).connect(o.bus ?? effectsBus);
  osc.start(t);
  osc.stop(t + o.duration + 0.05);
}

interface NoiseOptions {
  duration: number;
  volume: number;
  filter: BiquadFilterType;
  freq: number;
  q?: number;
  delay?: number;
  bus?: GainNode;
}

function noise(o: NoiseOptions): void {
  noiseAt(ctx!.currentTime + 0.01 + (o.delay ?? 0), o);
}

function noiseAt(t: number, o: NoiseOptions): void {
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.value = o.freq;
  filter.Q.value = o.q ?? 1;
  const gain = c.createGain();
  gain.gain.setValueAtTime(o.volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.duration);
  source
    .connect(filter)
    .connect(gain)
    .connect(o.bus ?? effectsBus);
  source.start(t, Math.random() * 0.5);
  source.stop(t + o.duration + 0.05);
}

/** Runs a sound effect, if effects are on and the browser has allowed sound. */
function effect(make: () => void): void {
  if (!settings.effects || !ctx || ctx.state !== "running") return;
  make();
}

// ---------- Sound effects ----------

export const sfx = {
  /** A wooden "tok" as a paddle goes up. Your own bids sound a little brighter. */
  bid(mine = false): void {
    effect(() => {
      const base = mine ? 760 : 620;
      tone({
        freq: base,
        to: base * 0.8,
        type: "triangle",
        duration: 0.09,
        volume: 0.22,
      });
      noise({ duration: 0.04, volume: 0.06, filter: "highpass", freq: 2500 });
    });
  },
  /** A soft falling note when someone drops out. */
  drop(): void {
    effect(() => tone({ freq: 260, to: 150, duration: 0.28, volume: 0.15 }));
  },
  /** A two-note chime: your turn. */
  turn(): void {
    effect(() => {
      tone({ freq: 784, duration: 0.35, volume: 0.16 });
      tone({ freq: 1175, duration: 0.45, volume: 0.13, delay: 0.12 });
    });
  },
  /** A quiet click for the last seconds of a turn. */
  tick(): void {
    effect(() =>
      tone({ freq: 1400, type: "square", duration: 0.025, volume: 0.035 }),
    );
  },
  /** Two knocks of the auctioneer's gavel. */
  gavel(): void {
    effect(() => {
      for (const [delay, loudness] of [
        [0, 1],
        [0.22, 0.8],
      ]) {
        noise({
          duration: 0.07,
          volume: 0.5 * loudness,
          filter: "lowpass",
          freq: 1200,
          delay,
        });
        tone({
          freq: 180,
          to: 70,
          duration: 0.16,
          volume: 0.6 * loudness,
          delay,
        });
      }
    });
  },
  /** A quick rising fanfare for a bargain. */
  cheer(): void {
    effect(() => {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
        tone({
          freq,
          type: "triangle",
          duration: 0.28,
          volume: 0.13,
          delay: i * 0.08,
        }),
      );
      noise({
        duration: 0.5,
        volume: 0.03,
        filter: "highpass",
        freq: 6000,
        delay: 0.25,
      });
    });
  },
  /** A sad "wah-wah" when someone overpays. */
  boo(): void {
    effect(() => {
      tone({
        freq: 233,
        to: 208,
        type: "sawtooth",
        duration: 0.35,
        volume: 0.09,
        lowpass: 900,
      });
      tone({
        freq: 196,
        to: 165,
        type: "sawtooth",
        duration: 0.55,
        volume: 0.09,
        lowpass: 800,
        delay: 0.32,
      });
    });
  },
};

// ---------- Music: a quiet lounge-jazz loop ----------

const BPM = 108;
const BEAT = 60 / BPM;
/** Swing: the off-beat lands two-thirds of the way through each beat. */
const SWING = 2 / 3;

interface Chord {
  /** Bass root, as a MIDI note number. */
  root: number;
  quality: "maj7" | "dom7" | "min7";
  /** Notes for the piano chords. */
  voicing: number[];
}

// A I-VI-ii-V turnaround in F, then iii-VI-ii-V: Fmaj7 D7 Gm7 C7 Am7 D7 Gm7 C7.
const PROGRESSION: Chord[] = [
  { root: 41, quality: "maj7", voicing: [57, 60, 64] },
  { root: 38, quality: "dom7", voicing: [54, 57, 60] },
  { root: 43, quality: "min7", voicing: [58, 62, 65] },
  { root: 36, quality: "dom7", voicing: [52, 58, 62] },
  { root: 45, quality: "min7", voicing: [55, 60, 64] },
  { root: 38, quality: "dom7", voicing: [54, 57, 60] },
  { root: 43, quality: "min7", voicing: [58, 62, 65] },
  { root: 36, quality: "dom7", voicing: [52, 58, 62] },
];

// Where the piano plays in a bar (in beats), varied so it doesn't feel mechanical.
const COMPING = [
  [1, 2 + SWING],
  [SWING, 2],
  [1 + SWING, 3],
  [0, 2 + SWING],
];

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);

function startMusic(): void {
  const c = audio();
  if (!c || musicTimer !== undefined) return;
  musicBus.gain.cancelScheduledValues(c.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
  musicBus.gain.linearRampToValueAtTime(MUSIC_VOLUME, c.currentTime + 2);
  nextBarTime = c.currentTime + 0.1;
  musicTimer = window.setInterval(scheduleAhead, 100);
  scheduleAhead();
}

function stopMusic(): void {
  if (musicTimer === undefined || !ctx) return;
  window.clearInterval(musicTimer);
  musicTimer = undefined;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
  musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
}

/** Schedules bars a little ahead of time, so the timing stays steady. */
function scheduleAhead(): void {
  const c = ctx!;
  while (nextBarTime < c.currentTime + 0.6) {
    scheduleBar(bar, nextBarTime);
    nextBarTime += 4 * BEAT;
    bar++;
  }
}

function scheduleBar(index: number, start: number): void {
  const chord = PROGRESSION[index % PROGRESSION.length];
  const next = PROGRESSION[(index + 1) % PROGRESSION.length];
  const at = (beat: number) => start + beat * BEAT;

  // Walking bass: root, third, fifth, then a step leading into the next chord.
  const third = chord.quality === "min7" ? 3 : 4;
  const walk = [chord.root, chord.root + third, chord.root + 7, next.root - 1];
  walk.forEach((note, beat) => {
    let n = note;
    while (n > 50) n -= 12;
    while (n < 33) n += 12;
    toneAt(at(beat), {
      freq: midi(n),
      type: "triangle",
      duration: BEAT * 0.95,
      volume: 0.5,
      attack: 0.01,
      lowpass: 700,
      bus: musicBus,
    });
  });

  // Ride cymbal "ding, ding-a ding, ding-a", and a soft hi-hat on 2 and 4.
  for (const beat of [0, 1, 1 + SWING, 2, 3, 3 + SWING]) {
    noiseAt(at(beat), {
      duration: 0.22,
      volume: Number.isInteger(beat) ? 0.07 : 0.045,
      filter: "bandpass",
      freq: 8500,
      q: 0.8,
      bus: musicBus,
    });
  }
  for (const beat of [1, 3]) {
    noiseAt(at(beat), {
      duration: 0.04,
      volume: 0.06,
      filter: "highpass",
      freq: 7000,
      bus: musicBus,
    });
  }

  // Soft piano-like chords.
  for (const beat of COMPING[index % COMPING.length]) {
    for (const note of chord.voicing) {
      toneAt(at(beat), {
        freq: midi(note),
        duration: BEAT * 0.9,
        volume: 0.07,
        attack: 0.012,
        lowpass: 1800,
        bus: musicBus,
      });
    }
  }

  // Now and then, a few notes on the vibraphone.
  if (index % 2 === 1 && Math.random() < 0.7) {
    const notes = chord.voicing.map((n) => n + 12);
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const beat =
        Math.floor(Math.random() * 4) + (Math.random() < 0.5 ? 0 : SWING);
      toneAt(at(beat), {
        freq: midi(notes[Math.floor(Math.random() * notes.length)]),
        duration: 1.2,
        volume: 0.06,
        attack: 0.004,
        bus: musicBus,
      });
    }
  }
}

// ---------- Remembering the player's choice ----------

function loadSettings(): SoundSettings {
  try {
    return {
      effects: true,
      music: true,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}"),
    };
  } catch {
    return { effects: true, music: true };
  }
}

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
