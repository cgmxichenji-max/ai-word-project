(function () {
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
        if (progressState && !progressState.dictationDone) {
          progressState.dictationDone = true;
          progressState.progress = Math.min(state.MAX_PROGRESS, progressState.progress + 1);
        }
        state.currentProgress = progressState ? progressState.progress : state.currentProgress;
        window.updateStudyProgressUI();
        window.setDictationFeedback('拼写正确，本项进度 +1', true);
      } else {
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
})();
