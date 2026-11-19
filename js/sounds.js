const ctx = () => {
  if (!window._audioCtx) window._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return window._audioCtx;
};

function beep(freq, dur, type = "sine", gain = 0.35) {
  try {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(c.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.stop(c.currentTime + dur);
  } catch {}
}

export const sounds = {
  send: () => { beep(660, 0.08); setTimeout(() => beep(880, 0.1), 60); },
  reply: () => beep(520, 0.12, "triangle"),
  typing: () => beep(300, 0.04, "square", 0.2),
  click: () => beep(440, 0.05, "sine", 0.25),
  receive: () => { beep(784, 0.09); setTimeout(() => beep(660, 0.09), 80); },
  error: () => beep(220, 0.2, "sawtooth", 0.1),
};

window.playSound = (name) => sounds[name]?.();