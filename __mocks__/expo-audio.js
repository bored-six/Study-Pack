/**
 * Jest stand-in for expo-audio: sfx.ts only needs a player that pretends.
 * Applied automatically to every suite (root __mocks__ shadows the module).
 */
const player = () => ({
  volume: 1,
  currentTime: 0,
  play: () => {},
  pause: () => {},
  seekTo: () => Promise.resolve(),
  remove: () => {},
});

module.exports = {
  createAudioPlayer: player,
  setAudioModeAsync: () => Promise.resolve(),
};
