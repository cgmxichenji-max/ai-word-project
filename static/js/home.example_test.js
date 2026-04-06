(function () {
  const state = window.homeState || {};

  state.exampleTestState = state.exampleTestState || {
    recognition: null,
    isListening: false,
    isSpeaking: false,
    running: false,
    loading: false,
    history: [],
    testWord: '',
    testExamples: [],
    selectedExamples: [],
    currentExampleIndex: 0,
    currentExampleText: '',
    speechEnabled: true,
    pendingMicStart: false,
    recognitionStartTimer: null,
    activeUtterance: null
  };

  function getExampleTestElements() {
    return {
      modeExampleTestBtn: document.getElementById('mode-example-test-btn'),
      modeExampleTestEndBtn: document.getElementById('mode-example-test-end-btn'),
      exampleTestPanel: document.getElementById('example-test-panel'),
      exampleTestHistory: document.getElementById('example-test-history'),
      exampleTestEmpty: document.getElementById('example-test-empty'),
      exampleTestInput: document.getElementById('example-test-input'),
      exampleTestMicBtn: document.getElementById('example-test-mic-btn'),
      exampleTestSubmitBtn: document.getElementById('example-test-submit-btn'),
      exampleTestEndBtn: document.getElementById('example-test-end-btn'),
      exampleTestFeedback: document.getElementById('example-test-feedback'),
      exampleTestStageHint: document.getElementById('example-test-stage-hint')
    };
  }

  function cleanText(value) {
    return String(value || '').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function logExampleTest() {
    if (!window.console || typeof window.console.log !== 'function') {
      return;
    }
    const args = Array.prototype.slice.call(arguments);
    args.unshift('[example-test]');
    window.console.log.apply(window.console, args);
  }

  function setExampleTestFeedback(text, isError) {
    const els = getExampleTestElements();
    if (!els.exampleTestFeedback) {
      return;
    }

    const value = cleanText(text);
    els.exampleTestFeedback.style.display = value ? 'block' : 'none';
    els.exampleTestFeedback.textContent = value;
    els.exampleTestFeedback.style.color = isError ? '#b91c1c' : '#475569';
  }

  function setExampleTestStageHint(text) {
    const els = getExampleTestElements();
    if (!els.exampleTestStageHint) {
      return;
    }

    els.exampleTestStageHint.textContent = cleanText(text) || '当前流程：逐句朗读 → 回答当前句大意 → 通过后进入下一句';
  }

  function renderExampleTestHistory() {
    const els = getExampleTestElements();
    if (!els.exampleTestHistory) {
      return;
    }

    const history = Array.isArray(state.exampleTestState.history) ? state.exampleTestState.history : [];
    if (!history.length) {
      els.exampleTestHistory.innerHTML = '<div id="example-test-empty" style="font-size: 14px; color: #94a3b8; line-height: 1.8; text-align: center; padding: 28px 10px;">暂未开始例句测试</div>';
      return;
    }

    els.exampleTestHistory.innerHTML = history.map(function (item) {
      const role = item.role === 'user' ? '你' : 'AI';
      const align = item.role === 'user' ? 'justify-content: flex-end;' : 'justify-content: flex-start;';
      const bg = item.role === 'user' ? '#dbeafe' : '#f8fafc';
      const color = item.role === 'user' ? '#1e3a8a' : '#0f172a';

      return '' +
        '<div style="display:flex;' + align + '">' +
          '<div style="max-width: 88%; border: 1px solid #dbe4f3; border-radius: 14px; background:' + bg + '; padding: 8px 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);">' +
            '<div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:700;">' + role + '</div>' +
            '<div style="font-size:12.5px; line-height:1.65; color:' + color + '; white-space:pre-wrap; word-break:break-word;">' + escapeHtml(item.text) + '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    els.exampleTestHistory.scrollTop = els.exampleTestHistory.scrollHeight;
  }

  function setExampleTestLoading(loading) {
    const els = getExampleTestElements();
    state.exampleTestState.loading = !!loading;

    if (els.exampleTestSubmitBtn) {
      els.exampleTestSubmitBtn.disabled = !!loading;
      els.exampleTestSubmitBtn.style.opacity = loading ? '0.65' : '1';
      els.exampleTestSubmitBtn.style.cursor = loading ? 'wait' : 'pointer';
      els.exampleTestSubmitBtn.textContent = loading ? '提交中...' : '提交测试';
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

  async function reportExampleTestProgressEvent(payload) {
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
      console.warn('[example-test] progress event failed:', error && error.message ? error.message : error);
      return null;
    }
  }

  async function prepareExamplesForTest(word, examples) {
    const currentExamples = Array.isArray(examples)
      ? examples.map(function (item) { return cleanText(item); }).filter(Boolean)
      : [];

    if (currentExamples.length >= 3) {
      return currentExamples;
    }

    try {
      logExampleTest('prepareExamplesForTest: requesting AI fill', {
        word: word,
        existingCount: currentExamples.length
      });

      const data = await postJson('/api/example-test/fill-examples', {
        word: cleanText(word),
        examples: currentExamples
      });

      const filledExamples = Array.isArray(data && data.examples)
        ? data.examples.map(function (item) { return cleanText(item); }).filter(Boolean)
        : [];

      if (filledExamples.length > 0) {
        logExampleTest('prepareExamplesForTest: AI filled examples', filledExamples);
        return filledExamples;
      }
    } catch (err) {
      logExampleTest('prepareExamplesForTest failed, fallback to current examples', err && err.message ? err.message : err);
    }

    return currentExamples;
  }

  function clearRecognitionStartTimer() {
    if (state.exampleTestState.recognitionStartTimer) {
      window.clearTimeout(state.exampleTestState.recognitionStartTimer);
      state.exampleTestState.recognitionStartTimer = null;
    }
  }

  function updateMicButtonState() {
    const els = getExampleTestElements();
    if (!els.exampleTestMicBtn) {
      return;
    }

    els.exampleTestMicBtn.disabled = !state.exampleTestState.running;
    els.exampleTestMicBtn.style.cursor = state.exampleTestState.running ? 'pointer' : 'not-allowed';
    els.exampleTestMicBtn.style.opacity = state.exampleTestState.running ? '1' : '0.5';
    els.exampleTestMicBtn.textContent = '麦克风';

    if (state.exampleTestState.isSpeaking) {
      els.exampleTestMicBtn.textContent = '朗读中...';
      els.exampleTestMicBtn.style.opacity = '0.6';
      return;
    }

    if (state.exampleTestState.isListening) {
      els.exampleTestMicBtn.textContent = '停止录音';
      els.exampleTestMicBtn.style.opacity = '0.75';
    }
  }

  function stopExampleSpeech(skipLog, preservePendingMicStart) {
    if (!preservePendingMicStart) {
      state.exampleTestState.pendingMicStart = false;
    }
    state.exampleTestState.isSpeaking = false;
    state.exampleTestState.activeUtterance = null;

    if (window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function') {
      try {
        window.speechSynthesis.cancel();
        if (!skipLog) {
          logExampleTest('speech canceled');
        }
      } catch (err) {
        if (!skipLog) {
          logExampleTest('speech cancel failed', err);
        }
      }
    }

    updateMicButtonState();
  }

  function chooseEnglishVoice() {
    if (!window.speechSynthesis || typeof window.speechSynthesis.getVoices !== 'function') {
      return null;
    }

    const voices = window.speechSynthesis.getVoices() || [];
    return voices.find(function (voice) {
      const lang = String((voice && voice.lang) || '').toLowerCase();
      const name = String((voice && voice.name) || '').toLowerCase();
      return (
        lang.indexOf('en-us') !== -1 ||
        lang.indexOf('en-gb') !== -1 ||
        lang.indexOf('en') === 0 ||
        name.indexOf('english') !== -1
      );
    }) || null;
  }

  function speakText(text, onEnd) {
    const content = cleanText(text);
    if (!content) {
      logExampleTest('skip speak: empty text');
      if (typeof onEnd === 'function') {
        onEnd();
      }
      return;
    }

    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      logExampleTest('speech synthesis unavailable');
      if (typeof onEnd === 'function') {
        onEnd();
      }
      return;
    }

    stopExampleSpeech(true, true);

    try {
      const utterance = new SpeechSynthesisUtterance(content);
      const selectedVoice = chooseEnglishVoice();

      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      state.exampleTestState.activeUtterance = utterance;

      utterance.onstart = function () {
        state.exampleTestState.isSpeaking = true;
        updateMicButtonState();
        setExampleTestFeedback('系统正在朗读当前测试例句，请先听。', false);
        logExampleTest('speech started', {
          text: content,
          voice: utterance.voice ? utterance.voice.name : utterance.lang
        });
      };

      const finishSpeech = function (reason, error) {
        if (state.exampleTestState.activeUtterance !== utterance) {
          return;
        }

        state.exampleTestState.activeUtterance = null;
        state.exampleTestState.isSpeaking = false;
        updateMicButtonState();
        logExampleTest('speech finished', reason, error || '');

        if (typeof onEnd === 'function') {
          onEnd();
        }
      };

      utterance.onend = function () {
        finishSpeech('end');
      };

      utterance.onerror = function (event) {
        finishSpeech('error', event && event.error ? event.error : 'unknown');
      };

      logExampleTest('speech speak()', { text: content });
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      state.exampleTestState.activeUtterance = null;
      state.exampleTestState.isSpeaking = false;
      updateMicButtonState();
      logExampleTest('speech setup failed', err);
      if (typeof onEnd === 'function') {
        onEnd();
      }
    }
  }

  function getCurrentExamplesFromQueue() {
    const button = state.manualActiveButton || null;
    if (!button || !button.dataset) {
      return { word: '', examples: [] };
    }

    let examples = [];
    try {
      const parsed = JSON.parse(button.dataset.examples || '[]');
      if (Array.isArray(parsed)) {
        examples = parsed
          .map(function (item) {
            if (!item || typeof item !== 'object') {
              return '';
            }
            return cleanText(item.example_en || item.en || item.text || '');
          })
          .filter(Boolean);
      }
    } catch (err) {
      examples = [];
    }

    return {
      word: cleanText(button.dataset.word),
      examples: examples
    };
  }

  function pickTestExamples(examples, limit) {
    const list = Array.isArray(examples)
      ? examples.map(function (item) { return cleanText(item); }).filter(Boolean)
      : [];

    if (!list.length) {
      return [];
    }

    const pool = list.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }

    return pool.slice(0, Math.max(1, Number(limit) || 3));
  }

  function getCurrentExampleTotal() {
    return Array.isArray(state.exampleTestState.selectedExamples)
      ? state.exampleTestState.selectedExamples.length
      : 0;
  }

  function getCurrentExampleNumber() {
    return state.exampleTestState.currentExampleIndex + 1;
  }

  function initVoiceRecognition() {
    if (state.exampleTestState.recognition) {
      return state.exampleTestState.recognition;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = function () {
      clearRecognitionStartTimer();
      state.exampleTestState.isListening = true;
      updateMicButtonState();
      setExampleTestFeedback('麦克风已开启，请回答当前这句话的大意。', false);
      logExampleTest('recognition started');
    };

    recognition.onend = function () {
      clearRecognitionStartTimer();
      state.exampleTestState.isListening = false;
      updateMicButtonState();
      logExampleTest('recognition ended');
    };

    recognition.onerror = function (event) {
      clearRecognitionStartTimer();
      state.exampleTestState.isListening = false;
      updateMicButtonState();
      setExampleTestFeedback('语音识别失败：' + (event && event.error ? event.error : 'unknown'), true);
      logExampleTest('recognition error', event && event.error ? event.error : 'unknown');
    };

    recognition.onresult = function (event) {
      const transcript = cleanText(
        event && event.results && event.results[0] && event.results[0][0]
          ? event.results[0][0].transcript
          : ''
      );
      const els = getExampleTestElements();

      if (els.exampleTestInput) {
        els.exampleTestInput.value = transcript;
        els.exampleTestInput.focus();
      }

      if (transcript) {
        setExampleTestFeedback('已识别当前回答，可直接提交。', false);
      }

      logExampleTest('recognition result', transcript);
    };

    state.exampleTestState.recognition = recognition;
    return recognition;
  }

  function startVoiceInput(options) {
    const recognition = initVoiceRecognition();
    const opts = options || {};

    if (!recognition) {
      setExampleTestFeedback('当前浏览器不支持语音识别。', true);
      return null;
    }

    if (!state.exampleTestState.running) {
      setExampleTestFeedback('请先开始例句测试。', true);
      return null;
    }

    clearRecognitionStartTimer();

    if (state.exampleTestState.isSpeaking) {
      setExampleTestFeedback('系统正在朗读当前句，请先听完。', true);
      logExampleTest('skip recognition start: speech still playing');
      return recognition;
    }

    if (state.exampleTestState.isListening) {
      logExampleTest('skip recognition start: already listening');
      return recognition;
    }

    const runStart = function () {
      clearRecognitionStartTimer();

      if (state.exampleTestState.isSpeaking || state.exampleTestState.isListening || !state.exampleTestState.running) {
        logExampleTest('cancel recognition start due to state', {
          isSpeaking: state.exampleTestState.isSpeaking,
          isListening: state.exampleTestState.isListening,
          running: state.exampleTestState.running
        });
        return;
      }

      try {
        logExampleTest('recognition start()');
        recognition.start();
      } catch (err) {
        setExampleTestFeedback('无法启动麦克风：' + (err && err.message ? err.message : 'unknown'), true);
        logExampleTest('recognition start failed', err);
      }
    };

    try {
      if (opts.immediate) {
        runStart();
      } else {
        state.exampleTestState.recognitionStartTimer = window.setTimeout(runStart, 120);
      }
    } catch (err) {
      setExampleTestFeedback('无法启动麦克风：' + (err && err.message ? err.message : 'unknown'), true);
      logExampleTest('recognition timer setup failed', err);
    }

    return recognition;
  }

  function stopVoiceInput() {
    clearRecognitionStartTimer();

    const recognition = state.exampleTestState.recognition;
    if (recognition) {
      try {
        recognition.stop();
        logExampleTest('recognition stop()');
      } catch (err) {
        logExampleTest('recognition stop failed', err);
      }
    }

    state.exampleTestState.isListening = false;
    updateMicButtonState();
    return recognition;
  }

  function speakCurrentExample() {
    const els = getExampleTestElements();
    const selectedExamples = Array.isArray(state.exampleTestState.selectedExamples)
      ? state.exampleTestState.selectedExamples
      : [];
    const currentIndex = state.exampleTestState.currentExampleIndex;
    const currentText = cleanText(selectedExamples[currentIndex] || '');
    const total = selectedExamples.length;
    const currentNo = currentIndex + 1;

    if (!state.exampleTestState.running) {
      return;
    }

    if (!currentText) {
      setExampleTestFeedback('当前句不存在，无法继续测试。', true);
      return;
    }

    state.exampleTestState.currentExampleText = currentText;
    state.exampleTestState.pendingMicStart = true;
    stopVoiceInput();

    state.exampleTestState.history.push({
      role: 'assistant',
      text: '第 ' + currentNo + ' / ' + total + ' 句测试开始：请先听这一句。'
    });
    state.exampleTestState.history.push({
      role: 'assistant',
      text: '测试例句：' + currentText
    });
    renderExampleTestHistory();

    setExampleTestStageHint('正在朗读第 ' + currentNo + ' / ' + total + ' 句，请先听，再回答这一句的大意。');
    setExampleTestFeedback('即将朗读第 ' + currentNo + ' 句。', false);
    updateMicButtonState();
    logExampleTest('speakCurrentExample', { index: currentIndex, total: total, text: currentText });

    speakText(currentText, function () {
      setExampleTestStageHint('第 ' + currentNo + ' / ' + total + ' 句已朗读完成，请回答这一句的大意。');
      setExampleTestFeedback('请回答第 ' + currentNo + ' 句的大意。', false);

      if (els.exampleTestInput) {
        els.exampleTestInput.focus();
      }

      if (state.exampleTestState.running && state.exampleTestState.pendingMicStart) {
        state.exampleTestState.pendingMicStart = false;
        startVoiceInput();
      }
    });
  }

  function moveToNextExample() {
    const total = getCurrentExampleTotal();

    state.exampleTestState.currentExampleIndex += 1;
    state.exampleTestState.currentExampleText = '';
    state.exampleTestState.pendingMicStart = false;

    if (state.exampleTestState.currentExampleIndex < total) {
      logExampleTest('moveToNextExample', {
        nextIndex: state.exampleTestState.currentExampleIndex,
        total: total
      });
      speakCurrentExample();
      return;
    }

    stopVoiceInput();
    state.exampleTestState.running = false;
    setExampleTestStageHint('本轮例句测试已完成。');
    setExampleTestFeedback('本轮例句测试已完成。', false);
    state.exampleTestState.history.push({
      role: 'assistant',
      text: '本轮例句测试已完成。'
    });
    renderExampleTestHistory();
    updateMicButtonState();
    logExampleTest('all examples completed');
  }

  async function submitExampleTest() {
    const els = getExampleTestElements();
    const answer = cleanText(els.exampleTestInput && els.exampleTestInput.value);
    const currentExample = cleanText(state.exampleTestState.currentExampleText);
    const currentNo = getCurrentExampleNumber();
    const total = getCurrentExampleTotal();

    if (!state.exampleTestState.running) {
      setExampleTestFeedback('请先开始例句测试。', true);
      return;
    }

    if (!currentExample) {
      setExampleTestFeedback('当前没有可提交判题的测试句。', true);
      return;
    }

    if (!answer) {
      setExampleTestFeedback('请输入你对当前句的大意理解。', true);
      return;
    }

    stopVoiceInput();
    state.exampleTestState.pendingMicStart = false;
    state.exampleTestState.history.push({
      role: 'user',
      text: '第 ' + currentNo + ' / ' + total + ' 句回答：' + answer
    });
    renderExampleTestHistory();
    setExampleTestLoading(true);
    setExampleTestFeedback('', false);
    setExampleTestStageHint('正在判定第 ' + currentNo + ' / ' + total + ' 句。');

    try {
      const data = await postJson('/api/example-test/check', {
        word: state.exampleTestState.testWord,
        examples: [currentExample],
        user_answer: answer
      });

      const result = data && data.result && typeof data.result === 'object' ? data.result : {};
      const passed = !!result.passed;
      const score = cleanText(result.score || '');
      const feedback = cleanText(result.feedback || '');
      const keywordHit = !!result.keyword_hit;
      const meaningOk = !!result.meaning_ok;

      let aiText = '第 ' + currentNo + ' / ' + total + ' 句';
      aiText += passed ? '通过。' : '未通过。';
      if (feedback) {
        aiText += ' ' + feedback;
      }
      if (score) {
        aiText += '（评分：' + score + '）';
      }
      if (!passed) {
        aiText += keywordHit || meaningOk ? ' 你已经抓到一部分意思了，请再试一次。' : ' 还没有抓到核心语义，请再试一次。';
      }

      state.exampleTestState.history.push({ role: 'assistant', text: aiText });
      renderExampleTestHistory();

      if (passed) {
        const progressState = window.ensureWordProgressState
        ? window.ensureWordProgressState(state.exampleTestState.testWord)
        : null;

        let progressDelta = 0;

        if (progressState) {
        const listeningProgress = Math.min(3, Number(progressState.exampleTestProgress || 0));

        if (listeningProgress < 3) {
            progressState.exampleTestProgress = listeningProgress + 1;
            progressState.progress = Math.min(
            state.MAX_PROGRESS,
            Number(progressState.progress || 0) + 1
            );
            progressDelta = 1;
        } else {
            progressState.exampleTestProgress = 3;
        }

        state.currentProgress = Number(progressState.progress || 0);

        if (typeof window.updateStudyProgressUI === 'function') {
            window.updateStudyProgressUI();
        }
        }

        await reportExampleTestProgressEvent({
        word: state.exampleTestState.testWord,
        source: 'example_test',
        is_correct: true,
        progress_delta: progressDelta,
        progress_value: progressState ? progressState.progress : state.currentProgress,
        max_progress: state.MAX_PROGRESS
        });

        setExampleTestFeedback(
        feedback || (
            progressDelta > 0
            ? ('第 ' + currentNo + ' 句通过，听力进度 +1，进入下一句。')
            : ('第 ' + currentNo + ' 句通过，但当前单词听力进度已满 3。')
        ),
        false
        );

        if (els.exampleTestInput) {
          els.exampleTestInput.value = '';
        }
        moveToNextExample();
      } else {
        await reportExampleTestProgressEvent({
          word: state.exampleTestState.testWord,
          source: 'example_test',
          is_correct: false,
          progress_delta: 0,
          progress_value: state.currentProgress,
          max_progress: state.MAX_PROGRESS
        });

        setExampleTestFeedback(feedback || ('第 ' + currentNo + ' 句未通过，请继续回答当前句。'), true);
        setExampleTestStageHint('第 ' + currentNo + ' / ' + total + ' 句未通过，请继续回答当前句的大意。');
        if (els.exampleTestInput) {
          els.exampleTestInput.focus();
        }
      }
    } catch (err) {
      const message = err && err.message ? err.message : '提交失败，请重试。';
      state.exampleTestState.history.push({ role: 'assistant', text: message });
      renderExampleTestHistory();
      setExampleTestFeedback(message, true);
      if (els.exampleTestInput) {
        els.exampleTestInput.focus();
      }
    } finally {
      setExampleTestLoading(false);
    }
  }

  function resetExampleTestState() {
    clearRecognitionStartTimer();
    stopExampleSpeech(true);

    state.exampleTestState.running = false;
    state.exampleTestState.loading = false;
    state.exampleTestState.history = [];
    state.exampleTestState.testWord = '';
    state.exampleTestState.testExamples = [];
    state.exampleTestState.selectedExamples = [];
    state.exampleTestState.currentExampleIndex = 0;
    state.exampleTestState.currentExampleText = '';
    state.exampleTestState.pendingMicStart = false;

    const els = getExampleTestElements();
    if (els.exampleTestInput) {
      els.exampleTestInput.value = '';
    }

    renderExampleTestHistory();
    setExampleTestFeedback('', false);
    setExampleTestStageHint('当前流程：逐句朗读 → 回答当前句大意 → 通过后进入下一句');
    updateMicButtonState();
  }

  async function startExampleTest() {
    const seed = getCurrentExamplesFromQueue();

    logExampleTest('startExampleTest', {
      word: seed.word,
      totalExamples: Array.isArray(seed.examples) ? seed.examples.length : 0,
      selectedExamples: seed.examples
    });

    stopVoiceInput();
    if (window.clearAutoSpeakTimers) {
      window.clearAutoSpeakTimers();
    }
    stopExampleSpeech();
    resetExampleTestState();

    if (!seed.word) {
      setExampleTestFeedback('当前没有可用于测试的单词。', true);
      return;
    }

    setExampleTestFeedback('正在准备测试例句，请稍候。', false);
    setExampleTestStageHint('正在检查并准备测试例句。');

    const preparedExamples = await prepareExamplesForTest(seed.word, seed.examples);
    const selectedExamples = pickTestExamples(preparedExamples, 3);

    logExampleTest('startExampleTest prepared', {
      word: seed.word,
      preparedCount: Array.isArray(preparedExamples) ? preparedExamples.length : 0,
      selectedExamples: selectedExamples
    });

    if (!selectedExamples.length) {
      setExampleTestFeedback('当前没有现成例句，无法开始测试。', true);
      return;
    }

    state.exampleTestState.running = true;
    state.exampleTestState.testWord = seed.word;
    state.exampleTestState.testExamples = Array.isArray(preparedExamples) ? preparedExamples.slice() : [];
    state.exampleTestState.selectedExamples = selectedExamples.slice();
    state.exampleTestState.currentExampleIndex = 0;
    state.exampleTestState.currentExampleText = '';

    state.exampleTestState.history.push({
      role: 'assistant',
      text: '开始例句测试。目标单词：' + seed.word
    });
    state.exampleTestState.history.push({
      role: 'assistant',
      text: '本次将逐句测试 ' + selectedExamples.length + ' 句。当前必须一题一答，当前句通过后才会进入下一句。'
    });
    if (Array.isArray(seed.examples) && seed.examples.filter(Boolean).length < 3 && preparedExamples.length >= 3) {
      state.exampleTestState.history.push({
        role: 'assistant',
        text: '当前原始例句不足 3 句，已尝试补足测试例句。'
      });
    }
    renderExampleTestHistory();

    setExampleTestStageHint('例句测试已开始，将按单句模式逐句进行。');
    setExampleTestFeedback('测试已开始，先听第 1 句。', false);
    updateMicButtonState();

    speakCurrentExample();
  }

  function endExampleTest() {
    stopVoiceInput();
    stopExampleSpeech();
    resetExampleTestState();
    setExampleTestFeedback('已结束例句测试。', false);
  }

  function bindExampleTestEvents() {
    const els = getExampleTestElements();

    if (els.modeExampleTestBtn && !els.modeExampleTestBtn.dataset.bound) {
      els.modeExampleTestBtn.dataset.bound = 'true';
      els.modeExampleTestBtn.addEventListener('click', function () {
        window.pauseHomeTtsLoop && window.pauseHomeTtsLoop();
        setExampleTestFeedback('正在准备单句测试，请稍候。', false);
        startExampleTest().catch(function (err) {
          const message = err && err.message ? err.message : '准备例句测试失败，请重试。';
          logExampleTest('startExampleTest failed', message);
          setExampleTestFeedback(message, true);
        });
      });
    }

    if (els.exampleTestMicBtn && !els.exampleTestMicBtn.dataset.bound) {
      els.exampleTestMicBtn.dataset.bound = 'true';
      els.exampleTestMicBtn.addEventListener('click', function (event) {
        if (event) {
          event.preventDefault();
        }

        if (!state.exampleTestState.running) {
          setExampleTestFeedback('请先开始例句测试。', true);
          return;
        }

        if (state.exampleTestState.isSpeaking) {
          setExampleTestFeedback('系统正在朗读当前句，请先听完，再开启麦克风。', true);
          return;
        }

        state.exampleTestState.pendingMicStart = false;
        if (state.exampleTestState.isListening) {
          stopVoiceInput();
        } else {
          startVoiceInput({ immediate: true });
        }
      });
    }

    if (els.exampleTestSubmitBtn && !els.exampleTestSubmitBtn.dataset.bound) {
      els.exampleTestSubmitBtn.dataset.bound = 'true';
      els.exampleTestSubmitBtn.addEventListener('click', function () {
        submitExampleTest();
      });
    }

    if (els.exampleTestInput && !els.exampleTestInput.dataset.bound) {
      els.exampleTestInput.dataset.bound = 'true';
      els.exampleTestInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          submitExampleTest();
        }
      });
    }

    if (els.exampleTestEndBtn && !els.exampleTestEndBtn.dataset.bound) {
      els.exampleTestEndBtn.dataset.bound = 'true';
      els.exampleTestEndBtn.addEventListener('click', function () {
        endExampleTest();
      });
    }

    if (els.modeExampleTestEndBtn && !els.modeExampleTestEndBtn.dataset.bound) {
      els.modeExampleTestEndBtn.dataset.bound = 'true';
      els.modeExampleTestEndBtn.addEventListener('click', function () {
        endExampleTest();
      });
    }
  }

  bindExampleTestEvents();
  renderExampleTestHistory();
  updateMicButtonState();

  window.startExampleTest = startExampleTest;
  window.submitExampleTest = submitExampleTest;
  window.endExampleTest = endExampleTest;
  window.reportExampleTestProgressEvent = reportExampleTestProgressEvent;
})();
