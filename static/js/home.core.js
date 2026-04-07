(function () {
  const pageData = window.HOME_PAGE_DATA || {};

  const homeDom = {
    startModePanel: document.getElementById('start-mode-panel'),
    startRandomBtn: document.getElementById('start-random-btn'),
    showManualPanelBtn: document.getElementById('show-manual-panel-btn'),
    showWordLibraryBtn: document.getElementById('show-word-library-btn'),
    manualLockHint: document.getElementById('manual-lock-hint'),
    manualAddPanel: document.getElementById('manual-add-panel'),
    manualWordInput: document.getElementById('manual-word-input'),
    manualAddWordBtn: document.getElementById('manual-add-word-btn'),
    manualAddMessage: document.getElementById('manual-add-message'),
    manualSelectedCount: document.getElementById('manual-selected-count'),
    manualSelectedList: document.getElementById('manual-selected-list'),
    manualClearBtn: document.getElementById('manual-clear-btn'),
    manualCancelBtn: document.getElementById('manual-cancel-btn'),
    manualStartBtn: document.getElementById('manual-start-btn'),
    studyStage: document.getElementById('study-stage'),
    mainWord: document.getElementById('main-word'),
    mainMeaning: document.getElementById('main-meaning'),
    mainCardFlip: document.getElementById('main-card-flip'),
    mainCardFront: document.getElementById('main-card-front'),
    mainCardBack: document.getElementById('main-card-back'),
    mainCardAlt: document.getElementById('main-card-alt'),
    mainCardToolbar: document.getElementById('main-card-toolbar'),
    mainCardModeTitle: document.getElementById('main-card-mode-title'),
    modeBackBtn: document.getElementById('mode-back-btn'),
    modeEditBtn: document.getElementById('mode-edit-btn'),
    mainCardAltPanel: document.getElementById('main-card-alt-panel'),
    mainCardAltEditor: document.getElementById('main-card-alt-editor'),
    mainCardAltTip: document.getElementById('main-card-alt-tip'),
    dictationPanel: document.getElementById('dictation-panel'),
    dictationInput: document.getElementById('dictation-input'),
    dictationFeedback: document.getElementById('dictation-feedback'),
    mainCardAltActions: document.getElementById('main-card-alt-actions'),
    infoSubmenu: document.getElementById('info-submenu'),
    infoSubmenuButtons: Array.from(document.querySelectorAll('.info-submenu-btn')),
    directionPreviewCard: document.getElementById('direction-preview-card'),
    directionPreviewTitle: document.getElementById('direction-preview-title'),
    directionPreviewSubtitle: document.getElementById('direction-preview-subtitle'),
    mainMeta: document.getElementById('main-word-meta'),
    globalSelectorAnchor: document.getElementById('global-selector-anchor'),
    globalDirectionAnchor: document.getElementById('global-direction-anchor'),
    floatingSelector: document.getElementById('floating-selector'),
    wordQueue: document.getElementById('word-queue'),
    selectorWindow: document.getElementById('selector-window'),
    ttsToggleBtn: document.getElementById('tts-toggle-global-btn'),
    ttsGlobalText: document.getElementById('tts-global-text'),
    mainCardWrap: document.getElementById('main-card-wrap'),
    studyProgressWrap: document.getElementById('study-progress-wrap'),
    studyProgressBar: document.getElementById('study-progress-bar'),
    studyProgressText: document.getElementById('study-progress-text'),
    studyCard: document.querySelector('.card'),
    pageWrap: document.querySelector('.wrap')
  };

  const homeState = {
    targetWordCount: Number(pageData.targetWordCount || 0),
    queueLocked: pageData.queueLocked === true || pageData.queueLocked === 'true',
    directionNavButtons: homeDom.directionPreviewCard ? [homeDom.directionPreviewCard] : [],
    ttsEnabled: true,
    autoSpeakTimer: null,
    autoSpeakDelayTimer: null,
    lastSpokenWord: '',
    manualActiveButton: null,
    studyStarted: false,
    manualSelectedWords: [],
    queueButtons: [],
    cardShowingMeaning: false,
    currentCardMode: 'word',
    altEditing: false,
    currentExampleIndex: 0,
    currentStoryIndex: 0,
    currentExampleRevealed: false,
    currentDictationWord: '',
    currentDictationInput: '',
    currentDictationLocked: false,
    currentProgress: 0,
    MAX_PROGRESS: 9,
    progressStateByWord: {},
    activeDirectionMode: '',
    directionCardMap: {
      examples: {
        title: '例句',
        subtitle: '看一句真实用法'
      },
      dialogue: {
        title: '对话',
        subtitle: '进入互动练习'
      },
      dictation: {
        title: '默写',
        subtitle: '用词义回想单词'
      },
      info: {
        title: '资料',
        subtitle: '查看词根词缀等'
      }
    },
    modeTitleMap: {
      word: '当前：主卡',
      examples: '当前：例句',
      dialogue: '当前：对话',
      dictation: '当前：默写',
      info: '当前：资料',
      word_root: '当前：词根',
      affix: '当前：词缀',
      history: '当前：背景',
      forms: '当前：变形',
      memory_tip: '当前：记忆',
      story: '当前：故事'
    },
    navButtonsVisible: false,
    navHideTimer: null,
    directionVisibilityTimer: null,
    lastShownDirectionMode: ''
  };

  window.homeDom = homeDom;
  window.homeState = homeState;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseDatasetList(value) {
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function getCurrentWordData() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (state.manualActiveButton) {
      return {
        word: state.manualActiveButton.dataset.word || '',
        meaning: state.manualActiveButton.dataset.meaning || '',
        word_root: state.manualActiveButton.dataset.word_root || '',
        affix: state.manualActiveButton.dataset.affix || '',
        history: state.manualActiveButton.dataset.history || '',
        forms: state.manualActiveButton.dataset.forms || '',
        memory_tip: state.manualActiveButton.dataset.memory_tip || '',
        examples: parseDatasetList(state.manualActiveButton.dataset.examples || ''),
        stories: parseDatasetList(state.manualActiveButton.dataset.stories || '')
      };
    }

    return {
      word: (dom.mainWord ? dom.mainWord.textContent : '').trim(),
      meaning: (dom.mainMeaning ? dom.mainMeaning.textContent : '').trim(),
      word_root: '',
      affix: '',
      history: '',
      forms: '',
      memory_tip: '',
      examples: [],
      stories: []
    };
  }

  function formatExampleItem(item) {
    if (!item) {
      return '暂无例句';
    }
    if (typeof item === 'string') {
      return item;
    }
    const en = String(item.example_en || item.en || '').trim();
    const zh = String(item.example_zh || item.zh || '').trim();
    if (en && zh) {
      return en + '\n\n' + zh;
    }
    return en || zh || '暂无例句';
  }

  function formatStoryItem(item) {
    if (!item) {
      return '暂无故事';
    }
    if (typeof item === 'string') {
      return item;
    }
    const en = String(item.story_en || item.en || '').trim();
    const zh = String(item.story_zh || item.zh || '').trim();
    if (en && zh) {
      return en + '\n\n' + zh;
    }
    return en || zh || '暂无故事';
  }

  function getCurrentSpeechText() {
    const state = window.homeState;
    const current = getCurrentWordData();

    if (state.currentCardMode === 'examples') {
      if (!current.examples.length) {
        return '';
      }
      const safeIndex = Math.max(0, Math.min(state.currentExampleIndex, current.examples.length - 1));
      const item = current.examples[safeIndex];
      if (!item) {
        return '';
      }
      if (typeof item === 'string') {
        return String(item).trim();
      }
      return String(item.example_en || item.en || '').trim();
    }

    return String(current.word || '').trim();
  }

  function getDictationTargetWord() {
    const current = getCurrentWordData();
    return String(current.word || '').trim();
  }

  function setDictationFeedback(text, isCorrect) {
    const dom = window.homeDom;

    if (!dom.dictationFeedback) {
      return;
    }
    dom.dictationFeedback.textContent = text || '';
    if (!text) {
      dom.dictationFeedback.style.color = '#475569';
      return;
    }
    dom.dictationFeedback.style.color = isCorrect ? '#166534' : '#b45309';
  }

  function updateStudyProgressUI() {
    const dom = window.homeDom;
    const state = window.homeState;
    const safeProgress = Math.max(0, Math.min(state.currentProgress, state.MAX_PROGRESS));
    const percent = (safeProgress / state.MAX_PROGRESS) * 100;

    if (dom.studyProgressBar) {
      dom.studyProgressBar.style.width = percent + '%';
    }
    if (dom.studyProgressText) {
      dom.studyProgressText.textContent = safeProgress + ' / ' + state.MAX_PROGRESS;
    }
  }

  function ensureWordProgressState(word) {
    const state = window.homeState;
    const key = String(word || '').trim().toLowerCase();
    if (!key) {
      return null;
    }
    if (!state.progressStateByWord[key]) {
      state.progressStateByWord[key] = {
        progress: 0,
        dictationDone: false
      };
    }
    return state.progressStateByWord[key];
  }

  function syncCurrentWordProgress() {
    const state = window.homeState;
    const targetWord = getDictationTargetWord();
    const progressState = ensureWordProgressState(targetWord);
    state.currentProgress = progressState ? progressState.progress : 0;
    updateStudyProgressUI();
  }

  function resetDictationState() {
    const dom = window.homeDom;
    const state = window.homeState;

    state.currentDictationWord = getDictationTargetWord();
    syncCurrentWordProgress();
    state.currentDictationInput = '';
    state.currentDictationLocked = false;
    if (dom.dictationInput) {
      dom.dictationInput.value = '';
      dom.dictationInput.readOnly = false;
      dom.dictationInput.blur();
    }
    setDictationFeedback('', false);
  }

  function showDictationInterface() {
    const dom = window.homeDom;

    if (dom.mainCardAltEditor) {
      dom.mainCardAltEditor.style.display = 'none';
    }
    if (dom.dictationPanel) {
      dom.dictationPanel.style.display = 'flex';
    }
    if (dom.mainCardAltTip) {
      dom.mainCardAltTip.style.display = 'none';
    }
    if (dom.dictationFeedback) {
      dom.dictationFeedback.style.display = 'block';
    }
    if (dom.mainCardAltActions) {
      dom.mainCardAltActions.innerHTML = '';
    }
    resetDictationState();
    window.setTimeout(function () {
      if (dom.dictationInput) {
        dom.dictationInput.focus();
        dom.dictationInput.select();
      }
    }, 0);
  }

  function hideDictationInterface() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (dom.mainCardAltEditor) {
      dom.mainCardAltEditor.style.display = 'block';
    }
    if (dom.dictationPanel) {
      dom.dictationPanel.style.display = 'none';
    }
    if (dom.mainCardAltTip) {
      dom.mainCardAltTip.style.display = 'block';
    }
    if (dom.dictationFeedback) {
      dom.dictationFeedback.style.display = 'none';
    }
    state.currentDictationWord = '';
    state.currentDictationInput = '';
    state.currentDictationLocked = false;
    if (dom.dictationInput) {
      dom.dictationInput.value = '';
      dom.dictationInput.readOnly = false;
    }
    setDictationFeedback('', false);
  }

  if (homeDom.globalSelectorAnchor) {
    homeDom.globalSelectorAnchor.style.right = '0';
    homeDom.globalSelectorAnchor.style.justifyContent = 'flex-end';
  }

  if (homeDom.floatingSelector && homeDom.globalSelectorAnchor) {
    homeDom.globalSelectorAnchor.appendChild(homeDom.floatingSelector);
  }

  updateStudyProgressUI();

  window.escapeHtml = escapeHtml;
  window.parseDatasetList = parseDatasetList;
  window.getCurrentWordData = getCurrentWordData;
  window.formatExampleItem = formatExampleItem;
  window.formatStoryItem = formatStoryItem;
  window.getCurrentSpeechText = getCurrentSpeechText;
  window.getDictationTargetWord = getDictationTargetWord;
  window.setDictationFeedback = setDictationFeedback;
  window.updateStudyProgressUI = updateStudyProgressUI;
  window.ensureWordProgressState = ensureWordProgressState;
  window.syncCurrentWordProgress = syncCurrentWordProgress;
  window.resetDictationState = resetDictationState;
  window.showDictationInterface = showDictationInterface;
  window.hideDictationInterface = hideDictationInterface;
})();
