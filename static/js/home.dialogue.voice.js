(function () {
  const state = window.homeState;

  state.dialogueState = state.dialogueState || {
    recognition: null,
    isListening: false
  };

  state.exampleSpeechRunId = state.exampleSpeechRunId || 0;

  function initVoiceRecognition() {
    return state.dialogueState.recognition;
  }

  function startVoiceInput() {
    state.dialogueState.isListening = true;
    return state.dialogueState.recognition;
  }

  function stopVoiceInput() {
    state.dialogueState.isListening = false;
    return state.dialogueState.recognition;
  }

  window.initVoiceRecognition = initVoiceRecognition;
  window.startVoiceInput = startVoiceInput;
  window.stopVoiceInput = stopVoiceInput;
})();
