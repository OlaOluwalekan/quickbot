const synth = window.speechSynthesis;

export const readAloud = (text: string, cb: (speaking: boolean) => void) => {
  if ("speechSynthesis" in window) {
    if (synth.speaking) {
      console.error("Speech synthesis is already speaking.");
      return;
    }
    const voices = synth.getVoices();
    const voice = voices.find((voice) => voice.default) || voices[0];

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.voice = voice;
    utterance.pitch = 1;
    utterance.rate = 1;
    utterance.volume = 1;
    utterance.onend = () => {
      cb(false);
    };
    cb(true);

    synth.speak(utterance);
  }
};

export const handleStop = (cb: (speaking: boolean) => void) => {
  if (synth.speaking) {
    synth.cancel();
    cb(false);
  }
};
