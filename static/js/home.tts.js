(function () {
  const dom = window.homeDom || {};
  const state = window.homeState || {};

  if (typeof state.ttsSessionId !== 'number') {
    state.ttsSessionId = 0;
  }

  // ── OpenAI TTS：fetch + Audio 播放，取代浏览器原生 speechSynthesis ──────
  // 前端按 text.toLowerCase() 缓存 blob URL，同一段文字只请求一次服务器。
  // 对外暴露的 safeTtsSpeak(utterance) 接口签名不变，
  // 兼容 home.dialogue.voice.js 传入的 SpeechSynthesisUtterance 对象。

  window._ttsAudioCache = window._ttsAudioCache || {};  // key → blob URL
  window._ttsCurrentAudio = window._ttsCurrentAudio || null;
  window._ttsPending = window._ttsPending || {};         // key → true（请求进行中）

  /** 停止当前正在播放的音频。 */
  function ttsStop() {
    if (window._ttsCurrentAudio) {
      try {
        window._ttsCurrentAudio.pause();
        window._ttsCurrentAudio.src = '';
      } catch (e) { /* ignore */ }
      window._ttsCurrentAudio = null;
    }
  }

  /** 判断是否正在播放。 */
  function ttsIsPlaying() {
    var a = window._ttsCurrentAudio;
    return !!(a && !a.paused && !a.ended);
  }

  /**
   * 统一朗读入口。
   * @param {SpeechSynthesisUtterance|{text:string,lang:string,onend?:Function,onerror?:Function}} utterance
   */
  function safeTtsSpeak(utterance) {
    var text = (utterance.text || '').trim();
    if (!text) return;

    var onEnd   = typeof utterance.onend   === 'function' ? utterance.onend   : null;
    var onError = typeof utterance.onerror === 'function' ? utterance.onerror : null;

    ttsStop(); // 停掉上一段

    var key = text.toLowerCase();

    function playUrl(url) {
      var audio = new Audio(url);
      window._ttsCurrentAudio = audio;
      audio.onended = function () {
        window._ttsCurrentAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = function (e) {
        window._ttsCurrentAudio = null;
        if (onError) onError(e);
      };
      audio.play().catch(function (e) {
        window._ttsCurrentAudio = null;
        if (onError) onError(e);
      });
    }

    // 前端缓存命中：直接播放，无需请求服务器
    if (window._ttsAudioCache[key]) {
      playUrl(window._ttsAudioCache[key]);
      return;
    }

    // 并发锁：同一 key 正在请求中，直接跳过，避免重复调用 API
    if (window._ttsPending[key]) {
      return;
    }
    window._ttsPending[key] = true;

    // 请求服务器生成（服务器端也有文件缓存，第二次极快）
    fetch('/api/tts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, lang: utterance.lang || 'en-US' })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('TTS 请求失败: ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        window._ttsAudioCache[key] = url;
        playUrl(url);
      })
      .catch(function (e) {
        if (onError) onError(e);
      })
      .finally(function () {
        delete window._ttsPending[key];
      });
  }
  // ──────────────────────────────────────────────────────────────────────────

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

    // examples 模式：当前还在播放则跳过（避免重叠）
    if (state.currentCardMode === 'examples') {
      if (ttsIsPlaying()) {
        return false;
      }
    }

    // 构造 utterance 对象（兼容 safeTtsSpeak 接口）
    var utterance = {
      text: speechText,
      lang: 'en-US',
      onend: null,
      onerror: null
    };

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

    safeTtsSpeak(utterance);
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
      ttsStop();
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
    ttsStop();
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
      if (!state.ttsEnabled) {
        ttsStop();
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
    ttsStop();
  });

  window.clearAutoSpeakTimers = clearAutoSpeakTimers;
  window.updateTtsButton = updateTtsButton;
  window.speakCurrentWord = speakCurrentWord;
  window.startAutoSpeak = startAutoSpeak;
  window.pauseHomeTtsLoop = pauseHomeTtsLoop;
  window.resumeHomeTtsLoop = resumeHomeTtsLoop;
  window.safeTtsSpeak = safeTtsSpeak;
  window.ttsStop = ttsStop;
  window.ttsIsPlaying = ttsIsPlaying;
})();
