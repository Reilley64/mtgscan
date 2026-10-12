import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type ScanSound = 'recognized' | 'failed';

const sources: Record<ScanSound, number> = {
  recognized: require('../../assets/sounds/scan-recognized.wav'),
  failed: require('../../assets/sounds/scan-failed.wav'),
};

let players: Record<ScanSound, AudioPlayer> | null = null;

async function loadedPlayers() {
  if (!players) {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
    players = {
      recognized: createAudioPlayer(sources.recognized),
      failed: createAudioPlayer(sources.failed),
    };
  }
  return players;
}

export async function preloadScanSounds() {
  await loadedPlayers();
}

export async function playScanSound(kind: ScanSound) {
  const player = (await loadedPlayers())[kind];
  await player.seekTo(0);
  player.play();
}
