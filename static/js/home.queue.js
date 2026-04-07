(function () {
  function updateMainCard(button) {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.mainWord || !dom.mainMeaning) {
      return;
    }
    const word = button ? (button.dataset.word || '') : '';
    const meaning = button ? (button.dataset.meaning || '') : '';
    dom.mainWord.textContent = word || '暂无单词';
    dom.mainMeaning.textContent = meaning || '暂无词义';
    state.cardShowingMeaning = false;
    state.currentExampleIndex = 0;
    state.currentStoryIndex = 0;
    state.currentExampleRevealed = false;

    if (typeof window.clearAutoSpeakTimers === 'function') {
      window.clearAutoSpeakTimers();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    state.lastSpokenWord = '';
    window.syncCurrentWordProgress();
    if (state.currentCardMode !== 'word') {
      window.switchCardMode(state.currentCardMode);
    }
    if (dom.mainCardFlip) {
      dom.mainCardFlip.style.transform = 'rotateY(0deg)';
    }

    if (state.studyStarted && state.ttsEnabled) {
      window.setTimeout(function () {
        if (typeof window.startAutoSpeak === 'function') {
          window.startAutoSpeak();
        }
        if (typeof window.speakCurrentWord === 'function') {
          window.speakCurrentWord(true);
        }
      }, 80);
    }
  }

  function scrollButtonToCenter(button) {
    const dom = window.homeDom;

    if (!dom.selectorWindow || !button) {
      return;
    }
    const buttonCenter = button.offsetTop + (button.offsetHeight / 2);
    const target = buttonCenter - (dom.selectorWindow.clientHeight / 2);
    dom.selectorWindow.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  function updateButtonVisual() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.selectorWindow || !state.queueButtons.length) {
      return;
    }

    const centerY = dom.selectorWindow.getBoundingClientRect().top + dom.selectorWindow.clientHeight / 2;
    let activeButton = null;
    let minDistance = Number.POSITIVE_INFINITY;

    state.queueButtons.forEach(function (btn) {
      const rect = btn.getBoundingClientRect();
      const btnCenterY = rect.top + rect.height / 2;
      const distance = Math.abs(centerY - btnCenterY);
      const normalized = Math.min(distance / 160, 1);
      const scale = 1 - normalized * 0.16;
      const opacity = Math.max(0.28, 1 - normalized * 0.45);

      btn.style.transform = 'scale(' + scale + ')';
      btn.style.opacity = String(opacity);
      btn.style.background = '#f8fbff';
      btn.classList.remove('is-active');
      btn.style.pointerEvents = 'auto';

      if (state.manualActiveButton === btn) {
        activeButton = btn;
        minDistance = -1;
      } else if (minDistance !== -1 && distance < minDistance) {
        minDistance = distance;
        activeButton = btn;
      }
    });

    if (activeButton) {
      activeButton.classList.add('is-active');
      activeButton.style.background = '#e0edff';
      activeButton.style.opacity = '1';
      activeButton.style.transform = 'scale(1)';
      updateMainCard(activeButton);
    }
  }

  function bindQueueButtonEvents() {
    const state = window.homeState;

    state.queueButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        state.manualActiveButton = button;
        updateMainCard(button);
        updateButtonVisual();
        scrollButtonToCenter(button);
        window.setTimeout(function () {
          updateButtonVisual();
        }, 220);
      });
    });
  }

  function renderStudyItems(items) {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.wordQueue || !dom.mainWord) {
      return;
    }

    const validItems = Array.isArray(items)
      ? items.filter(function (item) {
          const word = String((item && item.word) || '').trim();
          return word !== '';
        })
      : [];

    dom.wordQueue.innerHTML = '';
    state.queueButtons = [];
    state.manualActiveButton = null;

    validItems.forEach(function (item, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'queue-word-btn' + (index === 0 ? ' is-active' : '');
      button.dataset.index = String(index);
      button.dataset.word = String(item.word).trim();
      button.dataset.meaning = String((item.meaning || '')).trim();
      button.dataset.word_root = String((item.word_root || '')).trim();
      button.dataset.affix = String((item.affix || '')).trim();
      button.dataset.history = String((item.history || '')).trim();
      button.dataset.forms = String((item.forms || '')).trim();
      button.dataset.memory_tip = String((item.memory_tip || '')).trim();
      button.dataset.examples = JSON.stringify(Array.isArray(item.examples) ? item.examples : []);
      button.dataset.stories = JSON.stringify(Array.isArray(item.stories) ? item.stories : []);
      button.style.padding = '10px 14px';
      button.style.minHeight = '44px';
      button.style.borderRadius = '14px';
      button.style.background = index === 0 ? '#e0edff' : '#f8fbff';
      button.style.border = '1px solid #dbe4f3';
      button.style.color = '#111827';
      button.style.textAlign = 'left';
      button.style.cursor = 'pointer';
      button.style.font = 'inherit';
      button.style.transition = 'transform 0.18s ease, opacity 0.18s ease, background 0.18s ease, box-shadow 0.18s ease';
      button.textContent = String(item.word).trim();
      dom.wordQueue.appendChild(button);
      state.queueButtons.push(button);
    });

    if (validItems.length > 0) {
      dom.mainWord.textContent = String(validItems[0].word).trim();
      if (dom.mainMeaning) {
        dom.mainMeaning.textContent = String((validItems[0].meaning || '')).trim() || '暂无词义';
      }
      if (dom.mainCardFlip) {
        dom.mainCardFlip.style.transform = 'rotateY(0deg)';
      }
      state.cardShowingMeaning = false;
      state.currentCardMode = 'word';
      state.manualActiveButton = state.queueButtons[0] || null;
      window.syncCurrentWordProgress();
    } else {
      dom.mainWord.textContent = '暂无单词';
      if (dom.mainMeaning) {
        dom.mainMeaning.textContent = '暂无词义';
      }
      if (dom.mainCardFlip) {
        dom.mainCardFlip.style.transform = 'rotateY(0deg)';
      }
      state.cardShowingMeaning = false;
      state.currentCardMode = 'word';
      state.currentProgress = 0;
      window.updateStudyProgressUI();
    }

    bindQueueButtonEvents();

    if (dom.selectorWindow) {
      dom.selectorWindow.scrollTop = 0;
    }

    window.setTimeout(function () {
      updateButtonVisual();
    }, 60);
  }

  function revealStudyUi() {
    const dom = window.homeDom;
    const state = window.homeState;

    state.studyStarted = true;
    if (dom.startModePanel) {
      dom.startModePanel.style.display = 'none';
    }
    if (dom.studyStage) {
      dom.studyStage.style.display = 'flex';
    }
    if (dom.floatingSelector) {
      dom.floatingSelector.style.display = 'block';
    }
    if (dom.globalDirectionAnchor) {
      dom.globalDirectionAnchor.style.display = 'block';
      dom.globalDirectionAnchor.style.pointerEvents = 'none';
    }
    if (dom.studyProgressWrap) {
      dom.studyProgressWrap.style.display = 'block';
    }
    window.syncCurrentWordProgress();
  }

  function renderManualSelectedList() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.manualSelectedList || !dom.manualSelectedCount) {
      return;
    }

    dom.manualSelectedCount.textContent = String(state.manualSelectedWords.length);
    dom.manualSelectedList.innerHTML = '';

    if (state.manualSelectedWords.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.textContent = '还没有选择单词。';
      emptyRow.style.padding = '10px 12px';
      emptyRow.style.border = '1px dashed #dbe4f3';
      emptyRow.style.borderRadius = '12px';
      emptyRow.style.color = '#64748b';
      emptyRow.style.fontSize = '14px';
      dom.manualSelectedList.appendChild(emptyRow);
      return;
    }

    state.manualSelectedWords
      .map(function (word, index) {
        return { word: word, actualIndex: index };
      })
      .reverse()
      .forEach(function (item, displayIndex) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '10px';
        row.style.padding = '10px 12px';
        row.style.border = '1px solid #dbe4f3';
        row.style.borderRadius = '12px';
        row.style.background = '#ffffff';

        const label = document.createElement('div');
        label.textContent = (displayIndex + 1) + '. ' + item.word;
        label.style.color = '#111827';
        label.style.fontSize = '14px';
        label.style.fontWeight = '600';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '移除';
        removeBtn.style.padding = '6px 10px';
        removeBtn.style.border = '1px solid #dbe4f3';
        removeBtn.style.borderRadius = '10px';
        removeBtn.style.background = '#ffffff';
        removeBtn.style.color = '#475569';
        removeBtn.style.fontSize = '13px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.addEventListener('click', function () {
          state.manualSelectedWords = state.manualSelectedWords.filter(function (_, i) {
            return i !== item.actualIndex;
          });
          renderManualSelectedList();
          if (dom.manualAddMessage) {
            dom.manualAddMessage.textContent = '已移除一个单词。';
            dom.manualAddMessage.style.color = '#64748b';
          }
        });

        row.appendChild(label);
        row.appendChild(removeBtn);
        dom.manualSelectedList.appendChild(row);
      });
  }

  function openManualPanel() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (state.queueLocked) {
      if (dom.manualLockHint) {
        dom.manualLockHint.style.display = 'block';
        dom.manualLockHint.textContent = '今天已经开始学习，不能再手工选词。';
      }
      return;
    }
    if (dom.manualAddPanel) {
      dom.manualAddPanel.style.display = 'block';
    }
    if (dom.manualAddMessage) {
      dom.manualAddMessage.textContent = '请选择已有词库中的单词；如果系统中没有该单词，请前往“词库编辑”。';
      dom.manualAddMessage.style.color = '#64748b';
    }
    renderManualSelectedList();
    if (dom.manualWordInput) {
      dom.manualWordInput.focus();
    }
  }

  function closeManualPanel() {
    const dom = window.homeDom;

    if (dom.manualAddPanel) {
      dom.manualAddPanel.style.display = 'none';
    }
    if (dom.manualWordInput) {
      dom.manualWordInput.value = '';
    }
  }

  async function addManualWord() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.manualWordInput || !dom.manualAddMessage) {
      return;
    }
    if (state.queueLocked) {
      dom.manualAddMessage.textContent = '今天已经开始学习，不能再手工选词。';
      dom.manualAddMessage.style.color = '#b45309';
      return;
    }

    const rawWord = dom.manualWordInput.value || '';
    const word = rawWord.trim();
    if (!word) {
      dom.manualAddMessage.textContent = '请输入要选择的单词。';
      dom.manualAddMessage.style.color = '#b45309';
      dom.manualWordInput.focus();
      return;
    }

    if (state.manualSelectedWords.length >= state.targetWordCount) {
      dom.manualAddMessage.textContent = '已达到学习数上限，不能继续选词。';
      dom.manualAddMessage.style.color = '#b45309';
      return;
    }

    const normalizedWord = word.toLowerCase();
    const exists = state.manualSelectedWords.some(function (item) {
      return item.toLowerCase() === normalizedWord;
    });
    if (exists) {
      dom.manualAddMessage.textContent = '这个单词已经在手工选词列表里了。';
      dom.manualAddMessage.style.color = '#b45309';
      dom.manualWordInput.focus();
      dom.manualWordInput.select();
      return;
    }

    dom.manualAddWordBtn.disabled = true;
    dom.manualAddMessage.textContent = '正在校验单词是否存在于系统词库...';
    dom.manualAddMessage.style.color = '#64748b';

    try {
      const response = await fetch('/api/find-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: word })
      });

      const data = await response.json();
      const resolvedWord = String((data && data.word) || '').trim();
      if (!response.ok || !data || data.ok !== true || data.exists !== true || !resolvedWord) {
        dom.manualAddMessage.textContent = '该单词不在当前系统词库，请前往“词库编辑”新建。';
        dom.manualAddMessage.style.color = '#b45309';
        dom.manualWordInput.focus();
        dom.manualWordInput.select();
        return;
      }

      state.manualSelectedWords.push(resolvedWord);
      dom.manualWordInput.value = '';
      dom.manualAddMessage.textContent = '已加入手工选词列表：' + resolvedWord;
      dom.manualAddMessage.style.color = '#166534';
      renderManualSelectedList();
      if (dom.manualSelectedList) {
        dom.manualSelectedList.scrollTop = 0;
      }
      dom.manualWordInput.focus();
    } catch (error) {
      dom.manualAddMessage.textContent = '查询失败，请重试。';
      dom.manualAddMessage.style.color = '#b45309';
    } finally {
      dom.manualAddWordBtn.disabled = false;
    }
  }

  async function startRandomStudy() {
    const dom = window.homeDom;

    if (!dom.startRandomBtn) {
      return;
    }

    dom.startRandomBtn.disabled = true;
    dom.startRandomBtn.textContent = '正在开始...';

    try {
      const response = await fetch('/api/start-study', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error('start study failed');
      }

      revealStudyUi();
      renderStudyItems(data.items || []);
      window.updateTtsButton();
      window.startAutoSpeak();

      window.setTimeout(function () {
        window.speakCurrentWord(true);
      }, 100);
    } catch (error) {
      dom.startRandomBtn.disabled = false;
      dom.startRandomBtn.textContent = '随机开始';
      window.alert('开始学习失败，请重试。');
    }
  }

  async function startManualStudy() {
    const dom = window.homeDom;
    const state = window.homeState;

    if (!dom.manualAddMessage) {
      return;
    }
    if (state.queueLocked) {
      dom.manualAddMessage.textContent = '今天已经开始学习，不能再手工选词。';
      dom.manualAddMessage.style.color = '#b45309';
      return;
    }

    const normalizedWords = state.manualSelectedWords
      .map(function (item) {
        return String(item || '').trim();
      })
      .filter(function (item) {
        return item !== '';
      });

    state.manualSelectedWords = normalizedWords.filter(function (item, index) {
      return normalizedWords.findIndex(function (x) {
        return x.toLowerCase() === item.toLowerCase();
      }) === index;
    });

    if (state.manualSelectedWords.length === 0) {
      dom.manualAddMessage.textContent = '请先至少选择一个单词。';
      dom.manualAddMessage.style.color = '#b45309';
      return;
    }

    if (dom.manualStartBtn) {
      dom.manualStartBtn.disabled = true;
      dom.manualStartBtn.textContent = '正在开始...';
    }

    try {
      const response = await fetch('/api/start-study-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: state.manualSelectedWords.slice() })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        if (data && data.missing_words && data.missing_words.length > 0) {
          dom.manualAddMessage.textContent = '存在不在系统词库中的单词，请前往“词库编辑”处理：' + data.missing_words.join('、');
        } else {
          dom.manualAddMessage.textContent = (data && data.message) ? data.message : '手工开始失败，请重试。';
        }
        dom.manualAddMessage.style.color = '#b45309';
        return;
      }

      revealStudyUi();
      renderStudyItems(data.items || []);
      window.updateTtsButton();
      window.startAutoSpeak();
      closeManualPanel();

      window.setTimeout(function () {
        window.speakCurrentWord(true);
      }, 100);
    } catch (error) {
      dom.manualAddMessage.textContent = '手工开始失败，请重试。';
      dom.manualAddMessage.style.color = '#b45309';
    } finally {
      if (dom.manualStartBtn) {
        dom.manualStartBtn.disabled = false;
        dom.manualStartBtn.textContent = '开始本次学习';
      }
    }
  }

  const dom = window.homeDom;

  if (dom.selectorWindow) {
    dom.selectorWindow.addEventListener('scroll', function () {
      window.requestAnimationFrame(updateButtonVisual);
    });
  }

  window.addEventListener('resize', updateButtonVisual);

  if (dom.startRandomBtn) {
    dom.startRandomBtn.addEventListener('click', startRandomStudy);
  }

  if (dom.showManualPanelBtn) {
    dom.showManualPanelBtn.addEventListener('click', openManualPanel);
  }
  if (dom.showWordLibraryBtn) {
    dom.showWordLibraryBtn.addEventListener('click', function () {
      window.location.href = '/word-library';
    });
  }

  if (dom.manualAddWordBtn) {
    dom.manualAddWordBtn.addEventListener('click', addManualWord);
  }

  if (dom.manualWordInput) {
    dom.manualWordInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addManualWord();
      }
    });
  }

  if (dom.manualClearBtn) {
    dom.manualClearBtn.addEventListener('click', function () {
      window.homeState.manualSelectedWords = [];
      renderManualSelectedList();
      if (dom.manualAddMessage) {
        dom.manualAddMessage.textContent = '已清空手工选词列表。';
        dom.manualAddMessage.style.color = '#64748b';
      }
    });
  }

  if (dom.manualCancelBtn) {
    dom.manualCancelBtn.addEventListener('click', closeManualPanel);
  }

  if (dom.manualStartBtn) {
    dom.manualStartBtn.addEventListener('click', startManualStudy);
  }

  renderManualSelectedList();

  window.updateMainCard = updateMainCard;
  window.scrollButtonToCenter = scrollButtonToCenter;
  window.updateButtonVisual = updateButtonVisual;
  window.bindQueueButtonEvents = bindQueueButtonEvents;
  window.renderStudyItems = renderStudyItems;
  window.revealStudyUi = revealStudyUi;
  window.renderManualSelectedList = renderManualSelectedList;
  window.openManualPanel = openManualPanel;
  window.closeManualPanel = closeManualPanel;
  window.addManualWord = addManualWord;
  window.startRandomStudy = startRandomStudy;
  window.startManualStudy = startManualStudy;
})();
