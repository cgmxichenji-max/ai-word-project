(function () {
  const dom = window.homeDom || {};
  const state = window.homeState || {};

  if (typeof state.ttsSessionId !== 'number') {
    state.ttsSessionId = 0;
  }

  // ── 跨浏览器 TTS 工具 ──────────────────────────────────────────────
  // Chrome/Edge 的 voices 异步加载，且 cancel() 后立刻 speak() 会静音。
  // 以下两个函数处理这两个问题，并通过 window 暴露给其他模块使用。

  var _TTS_CANCEL_DELAY = 60; // ms：消除 Chrome/Edge cancel→speak 静音 bug

  // 让 Chrome/Edge 提前触发 voices 加载
  if ('speechSynthesis' in window && !window._ttsVoiceChangeListenerAdded) {
    window._ttsVoiceChangeListenerAdded = true;
    window.speechSynthesis.onvoiceschanged = function () { /* voices 就绪 */ };
    window.speechSynthesis.getVoices(); // 触发加载
  }

  function getTtsVoice(lang) {
    if (!('speechSynthesis' in window)) return null;
    var voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    var langLower = (lang || 'en-US').toLowerCase();
    var prefix = langLower.split('-')[0];
    // 1. 精确匹配（en-US === en-US）
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang.toLowerCase() === langLower) return voices[i];
    }
    // 2. 前缀匹配（en-US 没有时接受 en-GB 等）
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang.toLowerCase().indexOf(prefix + '-') === 0) return voices[i];
    }
    return null; // 找不到也不阻止朗读，让浏览器用默认 voice
  }

  // 安全朗读：先 cancel，等 60ms，再 speak，同时自动选 voice
  function safeTtsSpeak(utterance) {
    if (!('speechSynthesis' in window)) return;
    if (!utterance.voice) {
      var v = getTtsVoice(utterance.lang || 'en-US');
      if (v) utterance.voice = v;
    }
    window.speechSynthesis.cancel();
    window.setTimeout(function () {
      window.speechSynthesis.speak(utterance);
    }, _TTS_CANCEL_DELAY);
  }
  // ──────────────────────────────────────────────────────────────────

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

    if (!state.studyStarted || !state.ttsEnabled || !speechText || state.currentCardMode === 'dialogue' || state.currentCardMode === 'example_test') {
      return false;
    }
    if (!forceSpeak && speechText === state.lastSpokenWord) {
      return false;
    }
    if (!('speechSynthesis' in window)) {
      return false;
    }
    // examples 模式：startAutoSpeak 已在 80ms 前 cancel，直接检查是否已在播放
    // 非 examples 模式：safeTtsSpeak 内部会 cancel + 60ms 延迟，解决 Chrome/Edge 静音 bug
    if (state.currentCardMode === 'examples') {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        return false;
      }
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
      // examples 模式：cancel 已在 startAutoSpeak 里提前完成（有 80ms 间隔），直接 speak
      var exVoice = getTtsVoice('en-US');
      if (exVoice) utterance.voice = exVoice;
      window.speechSynthesis.speak(utterance);
    } else {
      // 非 examples 模式：用 safeTtsSpeak（cancel + 60ms + speak），修复 Chrome/Edge 静音
      safeTtsSpeak(utterance);
    }
    state.lastSpokenWord = speechText;
    return true;
  }

  function startAutoSpeak() {
    const state = window.homeState;

    clearAutoSpeakTimers();
    if (!state.studyStarted || !state.ttsEnabled || state.currentCardMode === 'dialogue' || state.currentCardMode === 'example_test') {
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

  function pauseHomeTtsLoop() {
    clearAutoSpeakTimers();
    state.lastSpokenWord = '';
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  function resumeHomeTtsLoop() {
    state.lastSpokenWord = '';
    if (!state.studyStarted || !state.ttsEnabled || state.currentCardMode === 'dialogue' || state.currentCardMode === 'example_test') {
      return;
    }
    startAutoSpeak();
    speakCurrentWord(true);
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
  window.pauseHomeTtsLoop = pauseHomeTtsLoop;
  window.resumeHomeTtsLoop = resumeHomeTtsLoop;
  window.getTtsVoice = getTtsVoice;
  window.safeTtsSpeak = safeTtsSpeak;
})();
