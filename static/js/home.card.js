(function () {
  function getDialogueElements() {
    return {
      modeDialogueBtn: document.getElementById('mode-dialogue-btn'),
      dialoguePanel: document.getElementById('dialogue-panel'),
      dialogueHistory: document.getElementById('dialogue-history'),
      dialogueEmpty: document.getElementById('dialogue-empty'),
      dialogueInput: document.getElementById('dialogue-input'),
      dialogueSendBtn: document.getElementById('dialogue-send-btn'),
      dialogueEndBtn: document.getElementById('dialogue-end-btn'),
      dialogueFeedback: document.getElementById('dialogue-feedback')
    };
  }

  function getExampleTestElements() {
    return {
      modeExampleTestBtn: document.getElementById('mode-example-test-btn'),
      modeExampleTestEndBtn: document.getElementById('mode-example-test-end-btn'),
      exampleTestPanel: document.getElementById('example-test-panel'),
      exampleTestInput: document.getElementById('example-test-input'),
      exampleTestSubmitBtn: document.getElementById('example-test-submit-btn'),
      exampleTestEndBtn: document.getElementById('example-test-end-btn'),
      exampleTestFeedback: document.getElementById('example-test-feedback')
    };
  }

  function setExampleTestButtonsVisible(showStart, showEnd) {
    const exampleTest = getExampleTestElements();

    if (exampleTest.modeExampleTestBtn) {
      exampleTest.modeExampleTestBtn.style.display = showStart ? 'inline-flex' : 'none';
      exampleTest.modeExampleTestBtn.disabled = false;
      exampleTest.modeExampleTestBtn.style.opacity = showStart ? '1' : '0';
      exampleTest.modeExampleTestBtn.style.cursor = showStart ? 'pointer' : 'default';
      exampleTest.modeExampleTestBtn.style.pointerEvents = showStart ? 'auto' : 'none';
    }

    if (exampleTest.modeExampleTestEndBtn) {
      exampleTest.modeExampleTestEndBtn.style.display = showEnd ? 'inline-flex' : 'none';
      exampleTest.modeExampleTestEndBtn.disabled = false;
      exampleTest.modeExampleTestEndBtn.style.opacity = showEnd ? '1' : '0';
      exampleTest.modeExampleTestEndBtn.style.cursor = showEnd ? 'pointer' : 'default';
      exampleTest.modeExampleTestEndBtn.style.pointerEvents = showEnd ? 'auto' : 'none';
    }
  }

  function setDialogueButtonVisible(visible) {
    const dialog = getDialogueElements();
    if (!dialog.modeDialogueBtn) {
      return;
    }

    dialog.modeDialogueBtn.style.display = visible ? 'inline-flex' : 'none';
    dialog.modeDialogueBtn.disabled = false;
    dialog.modeDialogueBtn.style.opacity = visible ? '1' : '0';
    dialog.modeDialogueBtn.style.cursor = visible ? 'pointer' : 'default';
    dialog.modeDialogueBtn.style.pointerEvents = visible ? 'auto' : 'none';
  }


  function resetDialoguePanelView() {
    const dialog = getDialogueElements();

    if (dialog.dialogueFeedback) {
      dialog.dialogueFeedback.style.display = 'none';
      dialog.dialogueFeedback.textContent = '';
    }
    if (dialog.dialogueEmpty) {
      dialog.dialogueEmpty.style.display = 'block';
      dialog.dialogueEmpty.textContent = '暂未开始对话';
    }
    if (dialog.dialogueInput) {
      dialog.dialogueInput.value = '';
    }
  }
  function setDirectionCardPosition(mode) {
    const dom = window.homeDom;

    if (!dom.directionPreviewCard || !dom.studyCard) {
      return;
    }

    const cardRect = dom.studyCard.getBoundingClientRect();
    const previewWidth = 360;
    const previewHeight = 220;
    const gap = 102;
    const viewportPadding = 18;

    let left = cardRect.left + cardRect.width / 2 - previewWidth / 2;
    let top = cardRect.top + cardRect.height / 2 - previewHeight / 2;
    let activeTransform = 'translate(-50%, -50%) scale(1)';
    let hiddenTransform = 'translate(-50%, -50%) scale(0.18)';

    if (mode === 'examples') {
      left = cardRect.left + cardRect.width / 2 - previewWidth / 2;
      top = Math.max(viewportPadding, cardRect.top - previewHeight - gap);
      activeTransform = 'translate(-50%, 0) scale(1)';
      hiddenTransform = 'translate(-50%, 0) scale(0.18)';
    } else if (mode === 'dialogue') {
      left = Math.max(viewportPadding, cardRect.left - previewWidth - gap);
      top = cardRect.top + cardRect.height / 2 - previewHeight / 2;
      activeTransform = 'translate(0, -50%) scale(1)';
      hiddenTransform = 'translate(0, -50%) scale(0.18)';
    } else if (mode === 'dictation') {
      left = Math.min(cardRect.right + gap, window.innerWidth - previewWidth - viewportPadding);
      top = cardRect.top + cardRect.height / 2 - previewHeight / 2;
      activeTransform = 'translate(0, -50%) scale(1)';
      hiddenTransform = 'translate(0, -50%) scale(0.18)';
    } else if (mode === 'info') {
      left = cardRect.left + cardRect.width / 2 - previewWidth / 2;
      top = Math.min(cardRect.bottom + gap, window.innerHeight - previewHeight - viewportPadding);
      activeTransform = 'translate(-50%, 0) scale(1)';
      hiddenTransform = 'translate(-50%, 0) scale(0.18)';
    }

    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - previewWidth - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - previewHeight - viewportPadding));

    dom.directionPreviewCard.style.left = left + 'px';
    dom.directionPreviewCard.style.top = top + 'px';
    dom.directionPreviewCard.style.right = 'auto';
    dom.directionPreviewCard.style.bottom = 'auto';
    dom.directionPreviewCard.dataset.activeTransform = activeTransform;
    dom.directionPreviewCard.dataset.hiddenTransform = hiddenTransform;
  }

  function updateDirectionCard(mode) {
    const dom = window.homeDom;
    const state = window.homeState;

    state.activeDirectionMode = mode || '';

    if (!dom.directionPreviewCard) {
      return;
    }

    if (!state.activeDirectionMode) {
      dom.directionPreviewCard.dataset.mode = '';
      dom.directionPreviewCard.style.top = '50%';
      dom.directionPreviewCard.style.left = '50%';
      dom.directionPreviewCard.style.right = '';
      dom.directionPreviewCard.style.bottom = '';
      dom.directionPreviewCard.dataset.activeTransform = 'translate(-50%, -50%) scale(1)';
      dom.directionPreviewCard.dataset.hiddenTransform = 'translate(-50%, -50%) scale(0.18)';
      dom.directionPreviewCard.style.transform = 'translate(-50%, -50%) scale(0.18)';
      return;
    }

    const cardCopy = state.directionCardMap[state.activeDirectionMode] || state.directionCardMap.info;
    dom.directionPreviewCard.dataset.mode = state.activeDirectionMode;
    if (dom.directionPreviewTitle) {
      dom.directionPreviewTitle.textContent = cardCopy.title;
    }
    if (dom.directionPreviewSubtitle) {
      dom.directionPreviewSubtitle.textContent = cardCopy.subtitle;
    }
    setDirectionCardPosition(state.activeDirectionMode);
    dom.directionPreviewCard.style.transform = dom.directionPreviewCard.dataset.hiddenTransform || 'translate(-50%, -50%) scale(0.18)';
  }

  function detectDirectionMode(clientX, clientY) {
    const dom = window.homeDom;

    if (!dom.mainCardFlip) {
      return '';
    }

    const rect = dom.mainCardFlip.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance < 90) {
      return '';
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx > 0 ? 'dictation' : 'dialogue';
    }

    return dy > 0 ? 'info' : 'examples';
  }

  function setDirectionButtonsVisible(visible) {
    const dom = window.homeDom;
    const state = window.homeState;

    state.navButtonsVisible = visible;

    if (state.directionVisibilityTimer) {
      window.clearTimeout(state.directionVisibilityTimer);
      state.directionVisibilityTimer = null;
    }

    if (dom.globalDirectionAnchor) {
      dom.globalDirectionAnchor.style.display = state.studyStarted ? 'block' : 'none';
      dom.globalDirectionAnchor.style.pointerEvents = 'none';
    }

    if (!dom.directionPreviewCard) {
      return;
    }

    const shouldShow = Boolean(visible && state.activeDirectionMode && state.studyStarted);

    if (shouldShow) {
      const activeTransform = dom.directionPreviewCard.dataset.activeTransform || 'translate(-50%, -50%) scale(1)';
      const hiddenTransform = dom.directionPreviewCard.dataset.hiddenTransform || 'translate(-50%, -50%) scale(0.18)';

      dom.directionPreviewCard.style.visibility = 'visible';
      dom.directionPreviewCard.style.pointerEvents = 'auto';

      if (state.lastShownDirectionMode !== state.activeDirectionMode) {
        dom.directionPreviewCard.style.opacity = '0';
        dom.directionPreviewCard.style.transform = hiddenTransform;
        void dom.directionPreviewCard.offsetWidth;
        window.requestAnimationFrame(function () {
          dom.directionPreviewCard.style.opacity = '1';
          dom.directionPreviewCard.style.transform = activeTransform;
        });
      } else {
        dom.directionPreviewCard.style.opacity = '1';
        dom.directionPreviewCard.style.transform = activeTransform;
      }

      state.lastShownDirectionMode = state.activeDirectionMode;
      return;
    }

    state.lastShownDirectionMode = '';

    dom.directionPreviewCard.style.opacity = '0';
    dom.directionPreviewCard.style.pointerEvents = 'none';
    dom.directionPreviewCard.style.transform = dom.directionPreviewCard.dataset.hiddenTransform || 'translate(-50%, -50%) scale(0.18)';
    state.directionVisibilityTimer = window.setTimeout(function () {
      if (!state.navButtonsVisible) {
        dom.directionPreviewCard.style.visibility = 'hidden';
      }
    }, 320);
  }

  function scheduleHideDirectionButtons() {
    const state = window.homeState;

    if (state.navHideTimer) {
      window.clearTimeout(state.navHideTimer);
    }
    state.navHideTimer = window.setTimeout(function () {
      if (state.currentCardMode === 'word') {
        setDirectionButtonsVisible(false);
        updateDirectionCard('');
      }
    }, 420);
  }

  function showDirectionButtonsTemporarily(event) {
    const state = window.homeState;

    if (state.currentCardMode !== 'word' || !state.studyStarted) {
      return;
    }
    if (!event) {
      return;
    }
    if (state.navHideTimer) {
      window.clearTimeout(state.navHideTimer);
    }
    const mode = detectDirectionMode(event.clientX, event.clientY);
    if (!mode) {
      setDirectionButtonsVisible(false);
      updateDirectionCard('');
      return;
    }
    updateDirectionCard(mode);
    setDirectionCardPosition(mode);
    setDirectionButtonsVisible(true);
  }

  function getModeContent(mode) {
    const state = window.homeState;
    const current = window.getCurrentWordData();

    if (mode === 'examples') {
      if (!current.examples.length) {
        return '暂无例句';
      }
      const safeIndex = Math.max(0, Math.min(state.currentExampleIndex, current.examples.length - 1));
      state.currentExampleIndex = safeIndex;
      if (!state.currentExampleRevealed) {
        return '【例句 ' + (safeIndex + 1) + ' / ' + current.examples.length + '】\n\n点击显示本条例句';
      }
      return window.formatExampleItem(current.examples[safeIndex]);
    }

    if (mode === 'dialogue') {
      return '【对话】（下一步接AI）';
    }

    if (mode === 'dictation') {
      return '';
    }

    if (mode === 'info') {
      return '请选择一个资料分类';
    }

    if (mode === 'word_root') {
      return current.word_root || '暂无词根';
    }

    if (mode === 'affix') {
      return current.affix || '暂无词缀';
    }

    if (mode === 'history') {
      return current.history || '暂无背景';
    }

    if (mode === 'forms') {
      return current.forms || '暂无变形';
    }

    if (mode === 'memory_tip') {
      return current.memory_tip || '暂无记忆';
    }

    if (mode === 'story') {
      if (!current.stories.length) {
        return '暂无故事';
      }
      const safeIndex = Math.max(0, Math.min(state.currentStoryIndex, current.stories.length - 1));
      state.currentStoryIndex = safeIndex;
      return window.formatStoryItem(current.stories[safeIndex]);
    }

    return '';
  }

  function updateModeHeader(mode) {
    const dom = window.homeDom;

    if (dom.mainCardModeTitle) {
      dom.mainCardModeTitle.textContent = window.homeState.modeTitleMap[mode] || '当前：听力';
    }
  }

  function updateInfoSubmenuActive(mode) {
    const dom = window.homeDom;

    dom.infoSubmenuButtons.forEach(function (button) {
      const active = button.dataset.infoMode === mode;
      button.style.background = active ? '#e0edff' : '#ffffff';
      button.style.color = active ? '#1d4ed8' : '#475569';
    });
  }


  function renderAltActions(mode) {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.mainCardAltActions) {
      return;
    }
    dom.mainCardAltActions.innerHTML = '';

    const current = window.getCurrentWordData();

    function buildPager(labelPrefix, currentIndex, total, onPrev, onNext) {
      const status = document.createElement('div');
      status.textContent = total > 0 ? (labelPrefix + ' ' + (currentIndex + 1) + ' / ' + total) : (labelPrefix + ' 0 / 0');
      status.style.fontSize = '13px';
      status.style.color = '#64748b';
      status.style.padding = '0 4px';

      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.textContent = '上一条';
      prevBtn.style.cssText = 'padding:6px 12px;border:1px solid #dbe4f3;border-radius:999px;background:#ffffff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;';
      prevBtn.disabled = total <= 1 || currentIndex <= 0;
      if (prevBtn.disabled) {
        prevBtn.style.opacity = '0.45';
        prevBtn.style.cursor = 'not-allowed';
      } else {
        prevBtn.addEventListener('click', onPrev);
      }

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.textContent = '下一条';
      nextBtn.style.cssText = 'padding:6px 12px;border:1px solid #dbe4f3;border-radius:999px;background:#ffffff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;';
      nextBtn.disabled = total <= 1 || currentIndex >= total - 1;
      if (nextBtn.disabled) {
        nextBtn.style.opacity = '0.45';
        nextBtn.style.cursor = 'not-allowed';
      } else {
        nextBtn.addEventListener('click', onNext);
      }

      dom.mainCardAltActions.appendChild(prevBtn);
      dom.mainCardAltActions.appendChild(status);
      dom.mainCardAltActions.appendChild(nextBtn);
    }

    if (mode === 'examples') {
      const revealBtn = document.createElement('button');
      revealBtn.type = 'button';
      revealBtn.textContent = state.currentExampleRevealed ? '隐藏内容' : '显示内容';
      revealBtn.style.cssText = 'padding:6px 12px;border:1px solid #dbe4f3;border-radius:999px;background:#ffffff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;';
      revealBtn.addEventListener('click', function () {
        state.currentExampleRevealed = !state.currentExampleRevealed;
        if (dom.mainCardAltEditor) {
          dom.mainCardAltEditor.value = getModeContent('examples');
        }
        renderAltActions('examples');
      });
      dom.mainCardAltActions.appendChild(revealBtn);
      buildPager(
        '例句',
        state.currentExampleIndex,
        current.examples.length,
        function () {
          state.currentExampleRevealed = false;
          state.currentExampleIndex = Math.max(0, state.currentExampleIndex - 1);
          state.lastSpokenWord = '';
          if (dom.mainCardAltEditor) {
            dom.mainCardAltEditor.value = getModeContent('examples');
          }
          renderAltActions('examples');
        },
        function () {
          state.currentExampleRevealed = false;
          state.currentExampleIndex = Math.min(current.examples.length - 1, state.currentExampleIndex + 1);
          state.lastSpokenWord = '';
          if (dom.mainCardAltEditor) {
            dom.mainCardAltEditor.value = getModeContent('examples');
          }
          renderAltActions('examples');
        }
      );
      return;
    }

    if (mode === 'story') {
      buildPager(
        '故事',
        state.currentStoryIndex,
        current.stories.length,
        function () {
          state.currentStoryIndex = Math.max(0, state.currentStoryIndex - 1);
          state.lastSpokenWord = '';
          if (dom.mainCardAltEditor) {
            dom.mainCardAltEditor.value = getModeContent('story');
          }
          renderAltActions('story');
        },
        function () {
          state.currentStoryIndex = Math.min(current.stories.length - 1, state.currentStoryIndex + 1);
          state.lastSpokenWord = '';
          if (dom.mainCardAltEditor) {
            dom.mainCardAltEditor.value = getModeContent('story');
          }
          renderAltActions('story');
        }
      );
    }
  }

  function switchCardMode(mode) {
    const dom = window.homeDom;
    const state = window.homeState;
    const previousMode = state.currentCardMode;
    const normalizedMode = mode === 'info' ? 'word_root' : mode;
    state.currentCardMode = normalizedMode;

    if (normalizedMode === 'dialogue' && previousMode !== 'dialogue') {
      window.pauseHomeTtsLoop && window.pauseHomeTtsLoop();
    }
    if (normalizedMode !== 'dialogue' && previousMode === 'dialogue') {
      window.resumeHomeTtsLoop && window.resumeHomeTtsLoop();
    }

    const dialog = getDialogueElements();
    const exampleTest = getExampleTestElements();
    const isWordMode = mode === 'word';
    const isDialogueMode = normalizedMode === 'dialogue';
    const isExampleTestMode = normalizedMode === 'example_test';
    const isDictationMode = normalizedMode === 'dictation';
    const isExamplesMode = normalizedMode === 'examples';
    const isInfoRootMode = normalizedMode === 'word_root';
    const isInfoChildMode = ['word_root', 'affix', 'history', 'forms', 'memory_tip', 'story'].indexOf(normalizedMode) !== -1;
    const isInfoMode = isInfoRootMode || isInfoChildMode;

    if (dom.mainCardFlip) {
      dom.mainCardFlip.style.display = isWordMode ? 'block' : 'none';
    }
    if (dom.mainCardAlt) {
      dom.mainCardAlt.style.display = isWordMode ? 'none' : 'block';
    }
    if (dom.mainCardToolbar) {
      dom.mainCardToolbar.style.display = isWordMode ? 'none' : 'flex';
    }
    if (dom.infoSubmenu) {
      dom.infoSubmenu.style.display = isInfoMode ? 'flex' : 'none';
    }
    if (dom.floatingSelector) {
      dom.floatingSelector.style.display = isDictationMode ? 'none' : 'block';
    }
    if (dialog.dialoguePanel) {
      dialog.dialoguePanel.style.display = isDialogueMode ? 'flex' : 'none';
    }
    if (exampleTest.exampleTestPanel) {
      exampleTest.exampleTestPanel.style.display = isExampleTestMode ? 'flex' : 'none';
    }
    if (dom.mainCardAltEditor) {
      dom.mainCardAltEditor.style.display = (isDialogueMode || isExampleTestMode) ? 'none' : 'block';
    }
    if (dom.mainCardAltTip) {
      dom.mainCardAltTip.style.display = (isDialogueMode || isExampleTestMode) ? 'none' : 'block';
    }
    if (dom.mainCardAltActions) {
      dom.mainCardAltActions.style.display = (isDialogueMode || isExampleTestMode) ? 'none' : 'flex';
    }
    if (dom.mainCardAlt && dom.mainCardAlt.style) {
      dom.mainCardAlt.style.justifyContent = (isDialogueMode || isExampleTestMode) ? 'flex-start' : 'center';
      dom.mainCardAlt.style.paddingTop = (isDialogueMode || isExampleTestMode) ? '8px' : '';
    }
    // Removed setEditButtonEnabled
    setDialogueButtonVisible(isDialogueMode);
    setExampleTestButtonsVisible(isExamplesMode, isExampleTestMode);

    updateModeHeader(normalizedMode);
    updateInfoSubmenuActive(isInfoChildMode ? normalizedMode : '');

    if (!isExamplesMode) {
      state.currentExampleRevealed = false;
    }

    if (isWordMode) {
      state.cardShowingMeaning = false;
      if (dom.mainCardFlip) {
        dom.mainCardFlip.style.transform = 'rotateY(0deg)';
      }
      setDirectionButtonsVisible(false);
      updateDirectionCard('');
      window.hideDictationInterface();
      renderAltActions(normalizedMode);
      return;
    }

    if (isDialogueMode) {
      window.hideDictationInterface();
      if (dom.mainCardAltEditor) {
        dom.mainCardAltEditor.value = '';
      }
      if (dialog.dialoguePanel) {
        dialog.dialoguePanel.style.marginTop = '0';
      }
      resetDialoguePanelView();
      if (dialog.dialogueInput) {
        window.setTimeout(function () {
          dialog.dialogueInput.focus();
        }, 0);
      }
    } else if (isDictationMode) {
      if (dom.mainCardAltEditor) {
        dom.mainCardAltEditor.value = '';
      }
      window.showDictationInterface();
    } else {
      window.hideDictationInterface();
      if (dom.mainCardAltEditor) {
        dom.mainCardAltEditor.value = getModeContent(normalizedMode);
        dom.mainCardAltEditor.scrollTop = 0;
      }
    }
    renderAltActions(normalizedMode);
    if (!isWordMode) {
      setDirectionButtonsVisible(false);
      updateDirectionCard('');
    }
    if (state.studyStarted && state.ttsEnabled && normalizedMode !== 'dialogue' && normalizedMode !== 'example_test') {
      window.startAutoSpeak();
    }
  }

  function toggleMainCardMeaning() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.mainCardFlip || !dom.mainWord || !dom.mainMeaning) {
      return;
    }
    if (state.currentCardMode !== 'word') {
      switchCardMode('word');
      return;
    }
    const currentWord = (dom.mainWord.textContent || '').trim();
    if (!currentWord || currentWord === '暂无单词') {
      return;
    }
    state.cardShowingMeaning = !state.cardShowingMeaning;
    dom.mainCardFlip.style.transform = state.cardShowingMeaning ? 'rotateY(180deg)' : 'rotateY(0deg)';
  }

  function returnToWordMode() {
    const state = window.homeState;

    if (state.currentCardMode !== 'word') {
      switchCardMode('word');
      return;
    }
    if (state.cardShowingMeaning) {
      toggleMainCardMeaning();
    }
  }

  const dom = window.homeDom;
  const state = window.homeState;

  if (dom.mainCardFlip) {
    dom.mainCardFlip.addEventListener('dblclick', function () {
      toggleMainCardMeaning();
    });
  }

  document.addEventListener('dblclick', function (event) {
    if (dom.directionPreviewCard && dom.directionPreviewCard.contains(event.target)) {
      return;
    }
    if (dom.floatingSelector && dom.floatingSelector.contains(event.target)) {
      return;
    }
    if (dom.mainCardFlip && dom.mainCardFlip.contains(event.target)) {
      return;
    }
    returnToWordMode();
  });

  dom.infoSubmenuButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      switchCardMode(button.dataset.infoMode || 'info');
    });
  });

  if (dom.modeBackBtn) {
    dom.modeBackBtn.addEventListener('click', function () {
      switchCardMode('word');
    });
  }

  const dialogueEls = getDialogueElements();

  const exampleTestEls = getExampleTestElements();

  if (exampleTestEls.modeExampleTestBtn) {
    exampleTestEls.modeExampleTestBtn.addEventListener('click', function () {
      switchCardMode('example_test');
      window.pauseHomeTtsLoop && window.pauseHomeTtsLoop();
    });
  }

  if (exampleTestEls.modeExampleTestEndBtn) {
    exampleTestEls.modeExampleTestEndBtn.addEventListener('click', function () {
      switchCardMode('word');
      window.resumeHomeTtsLoop && window.resumeHomeTtsLoop();
    });
  }

  if (exampleTestEls.exampleTestEndBtn) {
    exampleTestEls.exampleTestEndBtn.addEventListener('click', function () {
      switchCardMode('word');
      window.resumeHomeTtsLoop && window.resumeHomeTtsLoop();
    });
  }

  if (dialogueEls.modeDialogueBtn) {
    dialogueEls.modeDialogueBtn.addEventListener('click', function () {
      switchCardMode('dialogue');
    });
  }

  if (dialogueEls.dialogueEndBtn) {
    dialogueEls.dialogueEndBtn.addEventListener('click', function () {
      switchCardMode('word');
    });
  }

  window.addEventListener('mousemove', function (event) {
    showDirectionButtonsTemporarily(event);
  });

  document.addEventListener('mouseleave', function () {
    if (state.navHideTimer) {
      window.clearTimeout(state.navHideTimer);
    }
    setDirectionButtonsVisible(false);
    updateDirectionCard('');
  });

  window.addEventListener('blur', function () {
    if (state.navHideTimer) {
      window.clearTimeout(state.navHideTimer);
    }
    setDirectionButtonsVisible(false);
    updateDirectionCard('');
  });

  window.addEventListener('resize', function () {
    if (state.activeDirectionMode) {
      setDirectionCardPosition(state.activeDirectionMode);
    }
  });

  if (dom.globalDirectionAnchor) {
    dom.globalDirectionAnchor.addEventListener('mouseleave', function () {
      scheduleHideDirectionButtons();
    });
  }

  state.directionNavButtons.forEach(function (button) {
    button.addEventListener('mouseenter', function () {
      if (state.navHideTimer) {
        window.clearTimeout(state.navHideTimer);
      }
      if (state.currentCardMode === 'word' && state.studyStarted && state.activeDirectionMode) {
        setDirectionButtonsVisible(true);
      }
    });

    button.addEventListener('mouseleave', function () {
      scheduleHideDirectionButtons();
    });

    button.addEventListener('click', function () {
      if (!state.activeDirectionMode) {
        return;
      }
      if (state.navHideTimer) {
        window.clearTimeout(state.navHideTimer);
      }
      const targetMode = state.activeDirectionMode;
      setDirectionButtonsVisible(false);
      updateDirectionCard('');
      switchCardMode(targetMode);
    });
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.currentCardMode !== 'word') {
      switchCardMode('word');
    }
    if (event.key === 'Escape' && state.currentCardMode === 'word') {
      if (state.navHideTimer) {
        window.clearTimeout(state.navHideTimer);
      }
      setDirectionButtonsVisible(false);
    }
  });

  setDialogueButtonVisible(false);
  setExampleTestButtonsVisible(false, false);
  switchCardMode('word');
  updateDirectionCard('');
  setDirectionButtonsVisible(false);
  if (dom.globalDirectionAnchor && !state.studyStarted) {
    dom.globalDirectionAnchor.style.display = 'none';
  }

  window.setDirectionCardPosition = setDirectionCardPosition;
  window.updateDirectionCard = updateDirectionCard;
  window.detectDirectionMode = detectDirectionMode;
  window.setDirectionButtonsVisible = setDirectionButtonsVisible;
  window.scheduleHideDirectionButtons = scheduleHideDirectionButtons;
  window.showDirectionButtonsTemporarily = showDirectionButtonsTemporarily;
  window.getModeContent = getModeContent;
  window.updateModeHeader = updateModeHeader;
  window.updateInfoSubmenuActive = updateInfoSubmenuActive;
  window.renderAltActions = renderAltActions;
  window.switchCardMode = switchCardMode;
  window.toggleMainCardMeaning = toggleMainCardMeaning;
  window.returnToWordMode = returnToWordMode;
})();
