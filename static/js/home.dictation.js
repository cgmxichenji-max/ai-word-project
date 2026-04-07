(function () {
  async function reportProgressEvent(payload) {
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
      console.warn('[dictation] progress event failed:', error && error.message ? error.message : error);
      return null;
    }
  }

  async function submitDictationAnswer() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (state.currentDictationLocked) {
      return;
    }

    const targetWord = String(state.currentDictationWord || '').trim();
    if (!targetWord) {
      return;
    }

    state.currentDictationLocked = true;
    if (dom.dictationInput) {
      dom.dictationInput.readOnly = true;
    }

    const payload = {
      word: targetWord,
      answer: state.currentDictationInput
    };

    try {
      const response = await fetch('/api/check-dictation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error('check dictation failed');
      }

      if (data.is_correct) {
        const progressState = window.ensureWordProgressState(targetWord);
        let progressDelta = 0;

        if (progressState) {
          const dictationProgress = Math.min(3, Number(progressState.dictationProgress || 0));

          if (dictationProgress < 3) {
            progressState.dictationProgress = dictationProgress + 1;
            progressState.progress = Math.min(
              state.MAX_PROGRESS,
              Number(progressState.progress || 0) + 1
            );
            progressDelta = 1;
          } else {
            progressState.dictationProgress = 3;
          }
        }

        state.currentProgress = progressState ? Number(progressState.progress || 0) : state.currentProgress;
        window.updateStudyProgressUI();

        await reportProgressEvent({
          word: targetWord,
          source: 'dictation',
          is_correct: true,
          progress_delta: progressDelta,
          progress_value: progressState ? progressState.progress : state.currentProgress,
          max_progress: state.MAX_PROGRESS
        });

        window.setDictationFeedback(
          progressDelta > 0
            ? '拼写正确，默写进度 +1'
            : '拼写正确，但当前单词默写进度已满 3',
          true
        );
      } else {
        await reportProgressEvent({
          word: targetWord,
          source: 'dictation',
          is_correct: false,
          progress_delta: 0,
          progress_value: state.currentProgress,
          max_progress: state.MAX_PROGRESS
        });

        window.setDictationFeedback('拼写错误，正确答案：' + String(data.correct_word || targetWord), false);
      }

      if (dom.dictationInput) {
        dom.dictationInput.value = '';
      }
      state.currentDictationInput = '';
      state.currentDictationLocked = false;
      if (dom.dictationInput) {
        dom.dictationInput.readOnly = false;
      }
    } catch (error) {
      window.setDictationFeedback('判定失败，请重试', false);
      if (dom.dictationInput) {
        dom.dictationInput.value = '';
      }
      state.currentDictationInput = '';
      state.currentDictationLocked = false;
      if (dom.dictationInput) {
        dom.dictationInput.readOnly = false;
      }
    }
  }

  function handleDictationInputChange() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.dictationInput || state.currentCardMode !== 'dictation' || state.currentDictationLocked) {
      return;
    }
    state.currentDictationInput = String(dom.dictationInput.value || '');
  }

  const dom = window.homeDom;
  const state = window.homeState;

  if (dom.dictationInput) {
    dom.dictationInput.addEventListener('input', handleDictationInputChange);
    dom.dictationInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        state.currentDictationInput = String(dom.dictationInput.value || '');
        if (!state.currentDictationInput.trim()) {
          window.setDictationFeedback('请输入内容后再按回车', false);
          return;
        }
        submitDictationAnswer();
      }
    });
  }

  if (dom.dictationPanel) {
    dom.dictationPanel.addEventListener('click', function () {
      if (dom.dictationInput && state.currentCardMode === 'dictation' && !state.currentDictationLocked) {
        dom.dictationInput.focus();
      }
    });
  }

  window.submitDictationAnswer = submitDictationAnswer;
  window.handleDictationInputChange = handleDictationInputChange;
  window.reportDictationProgressEvent = reportProgressEvent;
})();
