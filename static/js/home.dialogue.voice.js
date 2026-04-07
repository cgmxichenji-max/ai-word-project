(function () {
  const state = window.homeState;
  const dom = window.homeDom || {};

  state.dialogueState = state.dialogueState || {
    recognition: null,
    isListening: false,
    stage: 'guess',
    started: false,
    loading: false,
    history: [],
    context: null,
    currentWordId: null,
    currentWord: '',
    speechEnabled: true,
    autoVoiceMode: true,
    shouldResumeListening: false
  };

  state.exampleSpeechRunId = state.exampleSpeechRunId || 0;

  function getDialogueElements() {
    return {
      modeDialogueBtn: document.getElementById('mode-dialogue-btn'),
      dialoguePanel: document.getElementById('dialogue-panel'),
      dialogueHistory: document.getElementById('dialogue-history'),
      dialogueEmpty: document.getElementById('dialogue-empty'),
      dialogueInput: document.getElementById('dialogue-input'),
      dialogueMicBtn: document.getElementById('dialogue-mic-btn'),
      dialogueSendBtn: document.getElementById('dialogue-send-btn'),
      dialogueEndBtn: document.getElementById('dialogue-end-btn'),
      dialogueFeedback: document.getElementById('dialogue-feedback'),
      dialogueStageHint: document.getElementById('dialogue-stage-hint'),
      dialogueIntro: document.getElementById('dialogue-intro')
    };
  }

  function initVoiceRecognition() {
    if (state.dialogueState.recognition) {
      return state.dialogueState.recognition;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = function () {
      state.dialogueState.isListening = true;
      const els = getDialogueElements();
      if (els.dialogueMicBtn) {
        els.dialogueMicBtn.textContent = '录音中...';
        els.dialogueMicBtn.style.opacity = '0.75';
      }
      setDialogueFeedback('麦克风已开启，请直接说话。', false);
    };

    recognition.onend = function () {
      state.dialogueState.isListening = false;
      const els = getDialogueElements();
      if (els.dialogueMicBtn) {
        els.dialogueMicBtn.textContent = '麦克风';
        els.dialogueMicBtn.style.opacity = '1';
      }
    };

    recognition.onerror = function (event) {
      state.dialogueState.isListening = false;
      const els = getDialogueElements();
      if (els.dialogueMicBtn) {
        els.dialogueMicBtn.textContent = '麦克风';
        els.dialogueMicBtn.style.opacity = '1';
      }
      setDialogueFeedback('语音识别失败：' + (event && event.error ? event.error : 'unknown'), true);
    };

    recognition.onresult = function (event) {
      const transcript = cleanText(
        event && event.results && event.results[0] && event.results[0][0]
          ? event.results[0][0].transcript
          : ''
      );
      const els = getDialogueElements();
      if (els.dialogueInput) {
        els.dialogueInput.value = '';
        els.dialogueInput.focus();
      }
      if (transcript) {
        setDialogueFeedback('已识别语音，正在自动发送。', false);
        sendDialogueMessage(transcript);
      }
    };

    state.dialogueState.recognition = recognition;
    return recognition;
  }

  function startVoiceInput() {
    const recognition = initVoiceRecognition();
    if (!recognition) {
      setDialogueFeedback('当前浏览器不支持语音识别。', true);
      return null;
    }

    try {
      recognition.start();
    } catch (err) {
      setDialogueFeedback('无法启动麦克风：' + (err && err.message ? err.message : 'unknown'), true);
    }
    return recognition;
  }

  function stopVoiceInput() {
    const recognition = state.dialogueState.recognition;
    if (!recognition) {
      return null;
    }

    try {
      recognition.stop();
    } catch (err) {
        // ignore
    }
    state.dialogueState.isListening = false;
    return recognition;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function speakDialogueText(text) {
    const content = cleanText(text);
    if (!content || !state.dialogueState.speechEnabled || !window.speechSynthesis) {
      if (state.dialogueState.autoVoiceMode && state.dialogueState.shouldResumeListening) {
        state.dialogueState.shouldResumeListening = false;
        window.setTimeout(function () {
          startVoiceInput();
        }, 150);
      }
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onend = function () {
        if (state.dialogueState.autoVoiceMode && state.dialogueState.shouldResumeListening) {
          state.dialogueState.shouldResumeListening = false;
          window.setTimeout(function () {
            startVoiceInput();
          }, 150);
        }
      };
      utterance.onerror = function () {
        if (state.dialogueState.autoVoiceMode && state.dialogueState.shouldResumeListening) {
          state.dialogueState.shouldResumeListening = false;
          window.setTimeout(function () {
            startVoiceInput();
          }, 150);
        }
      };
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      if (state.dialogueState.autoVoiceMode && state.dialogueState.shouldResumeListening) {
        state.dialogueState.shouldResumeListening = false;
        window.setTimeout(function () {
          startVoiceInput();
        }, 150);
      }
    }
  }

  function parseResultPayload(result) {
    if (!result) {
      return null;
    }

    if (typeof result === 'object') {
      return result;
    }

    const text = cleanText(result);
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (err) {
      return {
        stage: state.dialogueState.stage || 'guess',
        reply: text,
        passed: false,
        expected_word: state.dialogueState.currentWord || '',
        note: 'raw_text_fallback'
      };
    }
  }

  function getCurrentStudyButton() {
    const queueButtons = Array.isArray(state.queueButtons) ? state.queueButtons : [];

    if (state.manualActiveButton && queueButtons.indexOf(state.manualActiveButton) !== -1) {
      return state.manualActiveButton;
    }

    const activeBtn = queueButtons.find(function (btn) {
      return btn && btn.classList && btn.classList.contains('is-active');
    });
    if (activeBtn) {
      return activeBtn;
    }

    if (queueButtons.length > 0) {
      return queueButtons[0];
    }

    return null;
  }

  function buildContextFromQueueButton(button) {
    if (!button || !button.dataset) {
      return null;
    }

    let examplesText = cleanText(button.dataset.examples);
    let storyText = '';

    try {
      const examplesList = JSON.parse(button.dataset.examples || '[]');
      if (Array.isArray(examplesList) && examplesList.length > 0) {
        examplesText = examplesList.map(function (item) {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const en = cleanText(item.example_en || item.en || item.text || '');
          const zh = cleanText(item.example_zh || item.zh || '');
          return [en, zh].filter(Boolean).join(' | ');
        }).filter(Boolean).join('\n');
      }
    } catch (err) {
      examplesText = cleanText(button.dataset.examples);
    }

    try {
      const storyList = JSON.parse(button.dataset.stories || '[]');
      if (Array.isArray(storyList) && storyList.length > 0) {
        storyText = storyList.map(function (item) {
          if (!item || typeof item !== 'object') {
            return '';
          }
          const en = cleanText(item.story_en || item.en || item.text || '');
          const zh = cleanText(item.story_zh || item.zh || '');
          return [en, zh].filter(Boolean).join(' | ');
        }).filter(Boolean).join('\n');
      }
    } catch (err) {
      storyText = cleanText(button.dataset.stories);
    }

    return {
      word: cleanText(button.dataset.word),
      meaning: cleanText(button.dataset.meaning),
      examples: examplesText,
      word_root: cleanText(button.dataset.word_root),
      affix: cleanText(button.dataset.affix),
      history: cleanText(button.dataset.history),
      forms: cleanText(button.dataset.forms),
      memory_tip: cleanText(button.dataset.memory_tip),
      story: storyText
    };
  }

  function getCurrentDialogueSeed() {
    const button = getCurrentStudyButton();
    const context = buildContextFromQueueButton(button);
    return {
      wordId: null,
      word: context && context.word ? context.word : '',
      context: context
    };
  }

  function setDialogueFeedback(text, isError) {
    const els = getDialogueElements();
    if (!els.dialogueFeedback) {
      return;
    }

    const value = cleanText(text);
    els.dialogueFeedback.style.display = value ? 'block' : 'none';
    els.dialogueFeedback.textContent = value;
    els.dialogueFeedback.style.color = isError ? '#b91c1c' : '#475569';
  }

  function setDialogueStageHint(stage) {
    const els = getDialogueElements();
    if (!els.dialogueStageHint) {
      return;
    }

    const map = {
      guess: '当前流程：猜词 → 造句 → 理解验证',
      sentence: '当前流程：已进入造句阶段',
      check: '当前流程：已进入理解验证阶段',
      done: '当前流程：本轮对话已完成'
    };

    els.dialogueStageHint.textContent = map[stage] || '当前流程：猜词 → 造句 → 理解验证';
  }

  function renderDialogueHistory() {
    const els = getDialogueElements();
    if (!els.dialogueHistory) {
      return;
    }

    const history = Array.isArray(state.dialogueState.history) ? state.dialogueState.history : [];
    if (!history.length) {
      els.dialogueHistory.innerHTML = '<div id="dialogue-empty" style="font-size: 14px; color: #94a3b8; line-height: 1.8; text-align: center; padding: 28px 10px;">暂未开始对话</div>';
      return;
    }

    els.dialogueHistory.innerHTML = history.map(function (item) {
      const role = item.role === 'user' ? '你' : 'AI';
      const align = item.role === 'user' ? 'justify-content: flex-end;' : 'justify-content: flex-start;';
      const bg = item.role === 'user' ? '#dbeafe' : '#f8fafc';
      const color = item.role === 'user' ? '#1e3a8a' : '#0f172a';

      return '' +
        '<div style="display:flex;' + align + '">' +
          '<div style="max-width: 86%; border: 1px solid #dbe4f3; border-radius: 14px; background:' + bg + '; padding: 8px 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);">' +
            '<div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:700;">' + role + '</div>' +
            '<div style="font-size:12.5px; line-height:1.65; color:' + color + '; white-space:pre-wrap; word-break:break-word;">' + escapeHtml(item.text) + '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    els.dialogueHistory.scrollTop = els.dialogueHistory.scrollHeight;
  }

  function setDialogueLoading(loading) {
    const els = getDialogueElements();
    state.dialogueState.loading = !!loading;

    if (els.dialogueSendBtn) {
      els.dialogueSendBtn.disabled = !!loading;
      els.dialogueSendBtn.style.opacity = loading ? '0.65' : '1';
      els.dialogueSendBtn.style.cursor = loading ? 'wait' : 'pointer';
      els.dialogueSendBtn.textContent = loading ? '发送中...' : '发送';
    }

    if (els.modeDialogueBtn) {
      els.modeDialogueBtn.disabled = !!loading;
    }
  }

  function resetDialogueState(options) {
    const opts = options || {};
    state.dialogueState.stage = 'guess';
    state.dialogueState.started = false;
    state.dialogueState.loading = false;
    state.dialogueState.history = [];
    state.dialogueState.context = null;
    state.dialogueState.currentWordId = null;
    state.dialogueState.currentWord = '';
    state.dialogueState.shouldResumeListening = false;

    if (!opts.keepUi) {
      renderDialogueHistory();
      setDialogueFeedback('', false);
      setDialogueStageHint('guess');
      const els = getDialogueElements();
      if (els.dialogueInput) {
        els.dialogueInput.value = '';
      }
    }
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || ('请求失败：' + response.status));
    }

    return data;
  }

  async function reportDialogueProgressEvent(payload) {
    try {
      const response = await fetch('/api/progress/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });

      const data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'progress event failed');
      }

      return data;
    } catch (error) {
      console.warn('[dialogue] progress event failed:', error && error.message ? error.message : error);
      return null;
    }
  }

  async function startDialogue() {
    if (state.dialogueState.loading) {
      return;
    }

    const seed = getCurrentDialogueSeed();
    if (!seed.word) {
      setDialogueFeedback('当前没有可用于对话的单词。', true);
      return;
    }

    resetDialogueState({ keepUi: true });
    setDialogueLoading(true);
    setDialogueFeedback('', false);

    try {
      const data = await postJson('/api/dialogue/start', {
        word: seed.word
      });

      const parsed = parseResultPayload(data.result);
      state.dialogueState.stage = cleanText((parsed && parsed.stage) || data.stage || 'guess') || 'guess';
      state.dialogueState.started = true;
      state.dialogueState.context = data.context || seed.context || null;
      state.dialogueState.currentWordId = seed.wordId;
      state.dialogueState.currentWord = cleanText(data.word || seed.word);
      state.dialogueState.history = [];

      if (parsed && cleanText(parsed.reply)) {
        const assistantReply = cleanText(parsed.reply);
        state.dialogueState.history.push({ role: 'assistant', text: assistantReply });
        state.dialogueState.shouldResumeListening = true;
        speakDialogueText(assistantReply);
      } else {
        const fallbackReply = '对话已开始，但 AI 没有返回有效内容。';
        state.dialogueState.history.push({ role: 'assistant', text: fallbackReply });
        state.dialogueState.shouldResumeListening = true;
        speakDialogueText(fallbackReply);
      }

      renderDialogueHistory();
      setDialogueStageHint(state.dialogueState.stage);
      setDialogueFeedback('已开始对话。', false);

      const els = getDialogueElements();
      if (els.dialogueInput) {
        els.dialogueInput.value = '';
        els.dialogueInput.focus();
      }
    } catch (err) {
      resetDialogueState({ keepUi: true });
      renderDialogueHistory();
      setDialogueFeedback(err && err.message ? err.message : '开始对话失败。', true);
    } finally {
      setDialogueLoading(false);
    }
  }

    async function sendDialogueMessage(forcedMessage) {
    if (state.dialogueState.loading) {
      return;
    }

    const els = getDialogueElements();
    const inputValue = cleanText(forcedMessage || (els.dialogueInput && els.dialogueInput.value));
    if (!inputValue) {
      setDialogueFeedback('请输入你的回答。', true);
      return;
    }

    if (!state.dialogueState.started) {
      await startDialogue();
      if (!state.dialogueState.started) {
        return;
      }
    }

    state.dialogueState.history.push({ role: 'user', text: inputValue });
    renderDialogueHistory();
    setDialogueLoading(true);
    setDialogueFeedback('', false);

    try {
      const data = await postJson('/api/dialogue/reply', {
        stage: state.dialogueState.stage || 'guess',
        message: inputValue,
        history: state.dialogueState.history,
        context: state.dialogueState.context || {}
      });

      const parsed = parseResultPayload(data.result);
      const nextStage = cleanText((parsed && parsed.stage) || data.stage || state.dialogueState.stage || 'guess') || 'guess';
      const replyText = cleanText(parsed && parsed.reply);
      const passed = !!(parsed && parsed.passed);

      state.dialogueState.stage = nextStage;
      if (data.context) {
        state.dialogueState.context = data.context;
      }

      if (replyText) {
        state.dialogueState.history.push({ role: 'assistant', text: replyText });
        state.dialogueState.shouldResumeListening = nextStage !== 'done';
        speakDialogueText(replyText);
      } else {
        const fallbackReply = 'AI 没有返回有效回复。';
        state.dialogueState.history.push({ role: 'assistant', text: fallbackReply });
        state.dialogueState.shouldResumeListening = nextStage !== 'done';
        speakDialogueText(fallbackReply);
      }

    renderDialogueHistory();
    setDialogueStageHint(nextStage);

    if (passed) {
      const progressState = window.ensureWordProgressState
        ? window.ensureWordProgressState(state.dialogueState.currentWord)
        : null;

      let progressDelta = 0;

      if (progressState) {
        const dialogueProgress = Math.min(3, Number(progressState.dialogueProgress || 0));

        if (dialogueProgress < 3) {
          progressState.dialogueProgress = dialogueProgress + 1;
          progressState.progress = Math.min(
            state.MAX_PROGRESS,
            Number(progressState.progress || 0) + 1
          );
          progressDelta = 1;
        } else {
          progressState.dialogueProgress = 3;
        }

        state.currentProgress = Number(progressState.progress || 0);

        if (typeof window.updateStudyProgressUI === 'function') {
          window.updateStudyProgressUI();
        }
      }

      await reportDialogueProgressEvent({
        word: state.dialogueState.currentWord,
        source: 'dialogue',
        is_correct: true,
        progress_delta: progressDelta,
        progress_value: progressState ? progressState.progress : state.currentProgress,
        max_progress: state.MAX_PROGRESS
      });

      if (nextStage === 'done') {
        const currentDialogueProgress = progressState
          ? Math.min(3, Number(progressState.dialogueProgress || 0))
          : 0;

        if (currentDialogueProgress < 3) {
          const continueReply = '当前这轮已结束，但进度还没满。我们继续下一轮，请再根据提示回答。';
          state.dialogueState.stage = 'guess';
          state.dialogueState.started = true;
          state.dialogueState.shouldResumeListening = true;
          state.dialogueState.history.push({ role: 'assistant', text: continueReply });
          renderDialogueHistory();
          setDialogueStageHint('guess');
          speakDialogueText(continueReply);
          setDialogueFeedback('本轮通过，已自动继续下一轮。', false);
        } else {
          setDialogueFeedback('本轮对话已完成。', false);
        }
      } else {
        setDialogueFeedback(
          progressDelta > 0
            ? '当前环节通过，进度 +1。'
            : '当前环节通过，但当前单词对话进度已满 3。',
          false
        );
      }
    } else {
      await reportDialogueProgressEvent({
        word: state.dialogueState.currentWord,
        source: 'dialogue',
        is_correct: false,
        progress_delta: 0,
        progress_value: state.currentProgress,
        max_progress: state.MAX_PROGRESS
      });

      setDialogueFeedback('', false);
    }

      if (els.dialogueInput) {
        els.dialogueInput.value = '';
        if (!state.dialogueState.autoVoiceMode) {
          els.dialogueInput.focus();
        }
      }
    } catch (err) {
      setDialogueFeedback(err && err.message ? err.message : '发送失败。', true);
    } finally {
      setDialogueLoading(false);
    }
  }

  function endDialogue() {
    state.dialogueState.shouldResumeListening = false;
    stopVoiceInput();
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        // ignore
      }
    }
    resetDialogueState({ keepUi: false });
    setDialogueFeedback('已结束当前对话。', false);
    renderDialogueHistory();
  }

  function bindDialogueEvents() {
    const els = getDialogueElements();

    if (els.modeDialogueBtn && !els.modeDialogueBtn.dataset.dialogueBound) {
      els.modeDialogueBtn.dataset.dialogueBound = 'true';
      els.modeDialogueBtn.addEventListener('click', function () {
        state.dialogueState.autoVoiceMode = true;
        state.dialogueState.shouldResumeListening = false;
        window.setTimeout(function () {
          if (!state.dialogueState.started) {
            startDialogue();
          } else if (!state.dialogueState.isListening && !state.dialogueState.loading) {
            startVoiceInput();
          }
        }, 0);
      });
    }

    if (els.dialogueMicBtn && !els.dialogueMicBtn.dataset.dialogueBound) {
      els.dialogueMicBtn.dataset.dialogueBound = 'true';
      els.dialogueMicBtn.addEventListener('click', function () {
        if (state.dialogueState.isListening) {
          stopVoiceInput();
          return;
        }
        startVoiceInput();
      });
    }

    if (els.dialogueSendBtn && !els.dialogueSendBtn.dataset.dialogueBound) {
      els.dialogueSendBtn.dataset.dialogueBound = 'true';
      els.dialogueSendBtn.addEventListener('click', function () {
        sendDialogueMessage();
      });
    }

    if (els.dialogueInput && !els.dialogueInput.dataset.dialogueBound) {
      els.dialogueInput.dataset.dialogueBound = 'true';
      els.dialogueInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendDialogueMessage();
        }
      });
    }

    if (els.dialogueEndBtn && !els.dialogueEndBtn.dataset.dialogueBound) {
      els.dialogueEndBtn.dataset.dialogueBound = 'true';
      els.dialogueEndBtn.addEventListener('click', function () {
        endDialogue();
      });
    }
  }

  bindDialogueEvents();
  renderDialogueHistory();
  setDialogueStageHint('guess');

  window.initVoiceRecognition = initVoiceRecognition;
  window.startVoiceInput = startVoiceInput;
  window.stopVoiceInput = stopVoiceInput;
  window.startWordDialogue = startDialogue;
  window.sendWordDialogueMessage = sendDialogueMessage;
  window.endWordDialogue = endDialogue;
  window.reportDialogueProgressEvent = reportDialogueProgressEvent;
  })();
