// ---------------------------------------------------------------------------
// Sound Engine — Web Audio API with HTMLAudioElement fallback
// Uses no external dependencies (no Howler.js) to keep the bundle small.
// ---------------------------------------------------------------------------

export type SoundMode = 'off' | 'subtle' | 'full';
export type SoundCategory = 'ui' | 'reward' | 'game' | 'ambient';

export interface SoundConfig {
  src: string;
  category: SoundCategory;
  loop?: boolean;
}

const STORAGE_KEY_MODE = 'btcgame:sound-mode';
const STORAGE_KEY_VOLUME = 'btcgame:sound-volume';
const STORAGE_KEY_GAME_SOUNDS = 'btcgame:game-sounds';

class SoundEngine {
  private mode: SoundMode = 'off';
  private masterVolume = 1.0;
  private gameSoundsEnabled = true;

  /** Cached HTMLAudioElement instances keyed by sound id */
  private sounds = new Map<string, HTMLAudioElement>();

  /** Registered sound configurations keyed by sound id */
  private configs = new Map<string, SoundConfig>();

  /**
   * Category-level volume multipliers per mode.
   * Final volume = volumeMap[category][mode] * masterVolume
   */
  private volumeMap: Record<SoundCategory, Record<Exclude<SoundMode, 'off'>, number>> = {
    ui:      { subtle: 0.1,  full: 0.3 },
    reward:  { subtle: 0.3,  full: 0.6 },
    game:    { subtle: 0.2,  full: 0.5 },
    ambient: { subtle: 0.05, full: 0.15 },
  };

  constructor() {
    this.restoreFromStorage();
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private restoreFromStorage(): void {
    try {
      const storedMode = localStorage.getItem(STORAGE_KEY_MODE);
      if (storedMode === 'off' || storedMode === 'subtle' || storedMode === 'full') {
        this.mode = storedMode;
      }

      const storedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (storedVolume !== null) {
        const parsed = parseFloat(storedVolume);
        if (!Number.isNaN(parsed)) {
          this.masterVolume = Math.max(0, Math.min(1, parsed));
        }
      }

      const storedGameSounds = localStorage.getItem(STORAGE_KEY_GAME_SOUNDS);
      if (storedGameSounds !== null) {
        this.gameSoundsEnabled = storedGameSounds !== 'false';
      }
    } catch {
      // localStorage may be unavailable (SSR, privacy mode, etc.)
    }
  }

  private persistToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_MODE, this.mode);
      localStorage.setItem(STORAGE_KEY_VOLUME, String(this.masterVolume));
      localStorage.setItem(STORAGE_KEY_GAME_SOUNDS, String(this.gameSoundsEnabled));
    } catch {
      // Silently ignore storage errors
    }
  }

  // ---------------------------------------------------------------------------
  // Mode
  // ---------------------------------------------------------------------------

  setMode(mode: SoundMode): void {
    this.mode = mode;
    this.persistToStorage();

    // When switching to 'off', stop everything immediately
    if (mode === 'off') {
      this.stopAll();
    }
  }

  getMode(): SoundMode {
    return this.mode;
  }

  // ---------------------------------------------------------------------------
  // Master volume
  // ---------------------------------------------------------------------------

  setVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.persistToStorage();

    // Update all currently-playing sounds to the new volume
    for (const [id, audio] of this.sounds) {
      const config = this.configs.get(id);
      if (config && this.mode !== 'off') {
        audio.volume = this.resolveVolume(config.category);
      }
    }
  }

  getVolume(): number {
    return this.masterVolume;
  }

  // ---------------------------------------------------------------------------
  // Game sounds toggle
  // ---------------------------------------------------------------------------

  setGameSounds(enabled: boolean): void {
    this.gameSoundsEnabled = enabled;
    this.persistToStorage();

    // If disabling, stop any currently-playing game sounds
    if (!enabled) {
      for (const [id, audio] of this.sounds) {
        const config = this.configs.get(id);
        if (config?.category === 'game') {
          audio.pause();
          audio.currentTime = 0;
        }
      }
    }
  }

  getGameSounds(): boolean {
    return this.gameSoundsEnabled;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(id: string, config: SoundConfig): void {
    this.configs.set(id, config);
  }

  // ---------------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------------

  play(id: string): void {
    if (this.mode === 'off') return;

    const config = this.configs.get(id);
    if (!config) {
      if (import.meta.env.DEV) {
        console.warn(`[SoundEngine] Unknown sound id: "${id}"`);
      }
      return;
    }

    // Game category respects the dedicated toggle
    if (config.category === 'game' && !this.gameSoundsEnabled) return;

    const volume = this.resolveVolume(config.category);

    // Reuse existing element or create a new one
    let audio = this.sounds.get(id);
    if (!audio) {
      audio = new Audio(config.src);
      audio.preload = 'auto';
      this.sounds.set(id, audio);
    }

    audio.volume = volume;
    audio.loop = config.loop ?? false;

    // Reset to start if already playing so rapid-fire calls work
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Browser may block autoplay until user interaction — silently ignore
    });
  }

  stop(id: string): void {
    const audio = this.sounds.get(id);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  stopAll(): void {
    for (const audio of this.sounds.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Preloading
  // ---------------------------------------------------------------------------

  /**
   * Eagerly create HTMLAudioElement instances for every registered sound in the
   * given category so the browser can begin fetching them.
   */
  preloadCategory(category: SoundCategory): void {
    for (const [id, config] of this.configs) {
      if (config.category !== category) continue;
      if (this.sounds.has(id)) continue;

      const audio = new Audio(config.src);
      audio.preload = 'auto';
      this.sounds.set(id, audio);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveVolume(category: SoundCategory): number {
    if (this.mode === 'off') return 0;
    const categoryVol = this.volumeMap[category][this.mode];
    return categoryVol * this.masterVolume;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const soundEngine = new SoundEngine();

// ---------------------------------------------------------------------------
// Sound catalog — register every sound the app will use.
// Audio files live in /public/sounds/ and are referenced as absolute paths
// so Vite serves them from the public directory at runtime.
//
// TODO: Source and add the actual .mp3 / .ogg files to /public/sounds/
// ---------------------------------------------------------------------------

// -- UI sounds ---------------------------------------------------------------

// TODO: Source click sound — short, subtle tap/click (~50ms)
soundEngine.register('click', {
  src: '/sounds/ui-click.mp3',
  category: 'ui',
});

// TODO: Source toggle-on sound — soft positive chirp
soundEngine.register('toggle-on', {
  src: '/sounds/ui-toggle-on.mp3',
  category: 'ui',
});

// TODO: Source toggle-off sound — soft neutral/downward chirp
soundEngine.register('toggle-off', {
  src: '/sounds/ui-toggle-off.mp3',
  category: 'ui',
});

// TODO: Source nav sound — light swoosh/transition
soundEngine.register('nav', {
  src: '/sounds/ui-nav.mp3',
  category: 'ui',
});

// TODO: Source notification sound — attention-getting ping
soundEngine.register('notification', {
  src: '/sounds/ui-notification.mp3',
  category: 'ui',
});

// TODO: Source copy sound — quick confirmation blip
soundEngine.register('copy', {
  src: '/sounds/ui-copy.mp3',
  category: 'ui',
});

// -- Reward sounds -----------------------------------------------------------

// TODO: Source best-diff sound — triumphant short fanfare for personal best difficulty
soundEngine.register('best-diff', {
  src: '/sounds/reward-best-diff.mp3',
  category: 'reward',
});

// TODO: Source badge-earn sound — achievement unlock chime
soundEngine.register('badge-earn', {
  src: '/sounds/reward-badge-earn.mp3',
  category: 'reward',
});

// TODO: Source level-up sound — ascending scale / power-up
soundEngine.register('level-up', {
  src: '/sounds/reward-level-up.mp3',
  category: 'reward',
});

// TODO: Source streak sound — flame whoosh / combo continuation
soundEngine.register('streak', {
  src: '/sounds/reward-streak.mp3',
  category: 'reward',
});

// TODO: Source block-rumble sound — deep rumble building anticipation for block found
soundEngine.register('block-rumble', {
  src: '/sounds/reward-block-rumble.mp3',
  category: 'reward',
});

// TODO: Source block-reveal sound — dramatic reveal sting when block is confirmed
soundEngine.register('block-reveal', {
  src: '/sounds/reward-block-reveal.mp3',
  category: 'reward',
});

// TODO: Source block-confetti sound — celebratory burst for block found overlay
soundEngine.register('block-confetti', {
  src: '/sounds/reward-block-confetti.mp3',
  category: 'reward',
});

// -- Game sounds -------------------------------------------------------------

// TODO: Source hammer-whack sound — impact thud for Hammer game taps
soundEngine.register('hammer-whack', {
  src: '/sounds/game-hammer-whack.mp3',
  category: 'game',
});

// TODO: Source hammer-bell sound — bell ring for Hammer game high scores
soundEngine.register('hammer-bell', {
  src: '/sounds/game-hammer-bell.mp3',
  category: 'game',
});

// TODO: Source horse-gallop sound — galloping loop for Horse Race
soundEngine.register('horse-gallop', {
  src: '/sounds/game-horse-gallop.mp3',
  category: 'game',
  loop: true,
});

// TODO: Source horse-gun sound — starting pistol shot for Horse Race
soundEngine.register('horse-gun', {
  src: '/sounds/game-horse-gun.mp3',
  category: 'game',
});

// TODO: Source slot-spin sound — reel spinning whir for Slot Machine
soundEngine.register('slot-spin', {
  src: '/sounds/game-slot-spin.mp3',
  category: 'game',
  loop: true,
});

// TODO: Source slot-stop sound — reel stopping click for Slot Machine
soundEngine.register('slot-stop', {
  src: '/sounds/game-slot-stop.mp3',
  category: 'game',
});

// TODO: Source slot-match sound — winning match jingle for Slot Machine
soundEngine.register('slot-match', {
  src: '/sounds/game-slot-match.mp3',
  category: 'game',
});

// TODO: Source scratch sound — scratching/scraping for Scratch Card
soundEngine.register('scratch', {
  src: '/sounds/game-scratch.mp3',
  category: 'game',
});
