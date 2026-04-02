(function () {
  const dom = window.homeDom || {};
  const state = window.homeState || {};

  if (typeof state.ttsSessionId !== 'number') {
    state.ttsSessionId = 0;
  }

  function clearAutoSpeakTimers() {
    const state = window.homeState;

    if (state.autoSpeakTimer) {
      window.clearTimeout(state.autoSpeakTimer);
      state.autoSpeakTimer = null;
    }
    if (state.autoSpeakDelayTimer) {
      window.clearTimeout(state.autoSpeakDelayTimer);
      state.autoSpeakDelayTimer = null;
    }
    state.ttsSessionId += 1;
  }

  function updateTtsButton() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.ttsToggleBtn) {
      return;
    }
    dom.ttsToggleBtn.dataset.ttsEnabled = state.ttsEnabled ? 'true' : 'false';
    dom.ttsToggleBtn.style.background = state.ttsEnabled ? '#dbeafe' : '#f4f6fb';
    dom.ttsToggleBtn.style.borderColor = state.ttsEnabled ? '#93c5fd' : '#d1d5df';
    if (dom.ttsGlobalText) {
      dom.ttsGlobalText.textContent = state.ttsEnabled ? '朗读开' : '朗读关';
      dom.ttsGlobalText.style.color = state.ttsEnabled ? '#1d4ed8' : '#64748b';
    }
  }

  function speakCurrentWord(forceSpeak, sessionId) {
    const state = window.homeState;
    const speechText = window.getCurrentSpeechText();

    if (!state.studyStarted || !state.ttsEnabled || !speechText) {
      return false;
    }
    if (!forceSpeak && speechText === state.lastSpokenWord) {
      return false;
    }
    if (!('speechSynthesis' in window)) {
      return false;
    }
    if (state.currentCardMode !== 'examples') {
      window.speechSynthesis.cancel();
    } else if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      return false;
    }
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    if (state.currentCardMode === 'examples') {
      const activeSessionId = typeof sessionId === 'number' ? sessionId : state.ttsSessionId;
      utterance.onend = function () {
        if (activeSessionId !== state.ttsSessionId) {
          return;
        }
        if (state.autoSpeakDelayTimer) {
          window.clearTimeout(state.autoSpeakDelayTimer);
        }
        state.autoSpeakDelayTimer = window.setTimeout(function () {
          state.autoSpeakDelayTimer = null;
          if (
            activeSessionId === state.ttsSessionId &&
            state.studyStarted &&
            state.ttsEnabled &&
            state.currentCardMode === 'examples'
          ) {
            startAutoSpeak();
          }
        }, 2000);
      };
      utterance.onerror = function () {
        if (activeSessionId !== state.ttsSessionId) {
          return;
        }
        if (state.autoSpeakDelayTimer) {
          window.clearTimeout(state.autoSpeakDelayTimer);
        }
        state.autoSpeakDelayTimer = window.setTimeout(function () {
          state.autoSpeakDelayTimer = null;
          if (
            activeSessionId === state.ttsSessionId &&
            state.studyStarted &&
            state.ttsEnabled &&
            state.currentCardMode === 'examples'
          ) {
            startAutoSpeak();
          }
        }, 2000);
      };
    }
    window.speechSynthesis.speak(utterance);
    state.lastSpokenWord = speechText;
    return true;
  }

  function startAutoSpeak() {
    const state = window.homeState;

    clearAutoSpeakTimers();
    if (!state.studyStarted || !state.ttsEnabled) {
      return;
    }
    if (state.currentCardMode === 'examples') {
      const sessionId = state.ttsSessionId;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      state.lastSpokenWord = '';
      state.autoSpeakDelayTimer = window.setTimeout(function () {
        state.autoSpeakDelayTimer = null;
        if (
          sessionId !== state.ttsSessionId ||
          !state.studyStarted ||
          !state.ttsEnabled ||
          state.currentCardMode !== 'examples'
        ) {
          return;
        }
        if (!window.getCurrentSpeechText()) {
          state.autoSpeakDelayTimer = window.setTimeout(function () {
            state.autoSpeakDelayTimer = null;
            if (
              sessionId === state.ttsSessionId &&
              state.studyStarted &&
              state.ttsEnabled &&
              state.currentCardMode === 'examples'
            ) {
              startAutoSpeak();
            }
          }, 2000);
          return;
        }
        speakCurrentWord(true, sessionId);
      }, 80);
      return;
    }
    state.autoSpeakTimer = window.setTimeout(function repeatSpeech() {
      state.autoSpeakTimer = null;
      if (!state.studyStarted || !state.ttsEnabled || state.currentCardMode === 'examples') {
        return;
      }
      state.lastSpokenWord = '';
      speakCurrentWord(true);
      state.autoSpeakTimer = window.setTimeout(repeatSpeech, 2000);
    }, 2000);
  }

  if (dom.ttsToggleBtn) {
    dom.ttsToggleBtn.addEventListener('click', function () {
      state.ttsEnabled = !state.ttsEnabled;
      if (!state.ttsEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      state.ttsSessionId += 1;
      state.lastSpokenWord = '';
      updateTtsButton();
      if (state.ttsEnabled) {
        startAutoSpeak();
        speakCurrentWord(true);
      } else {
        clearAutoSpeakTimers();
      }
    });
  }

  updateTtsButton();

  window.addEventListener('beforeunload', function () {
    if (state.autoSpeakTimer) {
      window.clearTimeout(state.autoSpeakTimer);
    }
    if (state.autoSpeakDelayTimer) {
      window.clearTimeout(state.autoSpeakDelayTimer);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  window.clearAutoSpeakTimers = clearAutoSpeakTimers;
  window.updateTtsButton = updateTtsButton;
  window.speakCurrentWord = speakCurrentWord;
  window.startAutoSpeak = startAutoSpeak;
})();
