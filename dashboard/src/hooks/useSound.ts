import { useCallback } from 'react';
import {
  soundEngine,
  type SoundMode,
  type SoundCategory,
} from '@/lib/sound-engine';

/**
 * React hook that wraps the SoundEngine singleton for convenient use inside
 * components. All returned functions are stable references (via useCallback)
 * so they are safe to pass as props without causing unnecessary re-renders.
 */
export function useSound() {
  const play = useCallback((id: string) => {
    soundEngine.play(id);
  }, []);

  const stop = useCallback((id: string) => {
    soundEngine.stop(id);
  }, []);

  const stopAll = useCallback(() => {
    soundEngine.stopAll();
  }, []);

  const setMode = useCallback((mode: SoundMode) => {
    soundEngine.setMode(mode);
  }, []);

  const getMode = useCallback((): SoundMode => {
    return soundEngine.getMode();
  }, []);

  const setVolume = useCallback((vol: number) => {
    soundEngine.setVolume(vol);
  }, []);

  const getVolume = useCallback((): number => {
    return soundEngine.getVolume();
  }, []);

  const setGameSounds = useCallback((enabled: boolean) => {
    soundEngine.setGameSounds(enabled);
  }, []);

  const getGameSounds = useCallback((): boolean => {
    return soundEngine.getGameSounds();
  }, []);

  const preloadCategory = useCallback((category: SoundCategory) => {
    soundEngine.preloadCategory(category);
  }, []);

  return {
    play,
    stop,
    stopAll,
    setMode,
    getMode,
    setVolume,
    getVolume,
    setGameSounds,
    getGameSounds,
    preloadCategory,
  } as const;
}
