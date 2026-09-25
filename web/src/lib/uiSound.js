// The small sounds Mimyne makes when you vote, the same files and volumes as
// the app (src/runtime/uiSound.js there). One <audio> per sound, rewound on
// each play, so voting twice quickly never stacks a second copy.
import approveSound from '../assets/approve/approve.mp3';
import disapproveSound from '../assets/disapprove/disapprove.mp3';

// The app's switch for these sounds, under the same name.
export const UI_SOUND_KEY = 'mimyne_ui_sound';
export const APPROVE_VOLUME = 0.5;
// Disapproving is a private thud, so it sits under the celebration.
export const DISAPPROVE_VOLUME = 0.45;

export function uiSoundEnabled() {
  try {
    return localStorage.getItem(UI_SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

const sounds = { approve: null, disapprove: null };

function play(which, source, volume) {
  if (!uiSoundEnabled()) return;
  try {
    if (!sounds[which]) {
      sounds[which] = new Audio(source);
      sounds[which].volume = volume;
      sounds[which].preload = 'auto';
    }
    sounds[which].currentTime = 0;
    // Voting is a gesture, so a refusal here only means no audio device.
    sounds[which].play()?.catch?.(() => {});
  } catch {
    // No audio at all: stay quiet.
  }
}

export const playApproveSound = () => play('approve', approveSound, APPROVE_VOLUME);
export const playDisapproveSound = () => play('disapprove', disapproveSound, DISAPPROVE_VOLUME);
