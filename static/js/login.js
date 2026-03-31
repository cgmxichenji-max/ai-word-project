

(function () {
  const eyeLeft = document.getElementById('eyeLeft');
  const eyeRight = document.getElementById('eyeRight');
  const wrapLeft = document.getElementById('eyeWrapLeft');
  const wrapRight = document.getElementById('eyeWrapRight');
  const textInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
  const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));

  if (!eyeLeft || !eyeRight || !wrapLeft || !wrapRight) {
    return;
  }

  let activeMode = 'idle';
  let prankTimer = null;
  let prankResetTimer = null;
  let tweenTimer = null;

  function applyEyePosition(x, y) {
    eyeLeft.style.transform = `translate(${x}px, ${y}px)`;
    eyeRight.style.transform = `translate(${x}px, ${y}px)`;
  }

  function animateTo(x, y, duration = 180) {
    eyeLeft.style.transition = `transform ${duration}ms ease`;
    eyeRight.style.transition = `transform ${duration}ms ease`;
    applyEyePosition(x, y);
  }

  function restoreNormalTransition() {
    eyeLeft.style.transition = 'transform 0.12s ease';
    eyeRight.style.transition = 'transform 0.12s ease';
  }

  function openEyes() {
    wrapLeft.classList.remove('closed');
    wrapRight.classList.remove('closed');
  }

  function closeEyes() {
    wrapLeft.classList.add('closed');
    wrapRight.classList.add('closed');
  }

  function clearTimers() {
    if (prankTimer) {
      clearTimeout(prankTimer);
      prankTimer = null;
    }
    if (prankResetTimer) {
      clearTimeout(prankResetTimer);
      prankResetTimer = null;
    }
    if (tweenTimer) {
      clearTimeout(tweenTimer);
      tweenTimer = null;
    }
  }

  function idleLookWander() {
    clearTimers();
    const delay = 900 + Math.random() * 1600;
    prankTimer = setTimeout(function () {
      if (activeMode !== 'idle') return;
      const options = [
        { x: -10, y: -8 },
        { x: 10, y: -8 },
        { x: -12, y: 6 },
        { x: 12, y: 6 },
        { x: 0, y: -12 },
        { x: 0, y: 0 }
      ];
      const pos = options[Math.floor(Math.random() * options.length)];
      animateTo(pos.x, pos.y, 220);
      prankResetTimer = setTimeout(function () {
        if (activeMode !== 'idle') return;
        animateTo(0, 0, 220);
        idleLookWander();
      }, 260 + Math.random() * 260);
    }, delay);
  }

  function startTextSneak() {
    clearTimers();
    openEyes();

    animateTo(-12, -12, 110);
    tweenTimer = setTimeout(function () {
      if (activeMode !== 'text') return;
      animateTo(9, 6, 1200);

      prankTimer = setTimeout(function () {
        if (activeMode !== 'text') return;
        prankResetTimer = setTimeout(function () {
          if (activeMode !== 'text') return;
          animateTo(-12, -12, 90);
          tweenTimer = setTimeout(function () {
            if (activeMode !== 'text') return;
            animateTo(0, 8, 180);
            startTextSneakLoop();
          }, 180);
        }, 900);
      }, 760);
    }, 120);
  }

  function startTextSneakLoop() {
    clearTimers();
    const delay = 1100 + Math.random() * 1500;
    prankTimer = setTimeout(function () {
      if (activeMode !== 'text') return;
      animateTo(-12, -12, 90);
      tweenTimer = setTimeout(function () {
        if (activeMode !== 'text') return;
        animateTo(9, 6, 1200);
        prankResetTimer = setTimeout(function () {
          if (activeMode !== 'text') return;
          animateTo(-12, -12, 90);
          tweenTimer = setTimeout(function () {
            if (activeMode !== 'text') return;
            animateTo(0, 8, 180);
            startTextSneakLoop();
          }, 180);
        }, 900);
      }, 130);
    }, delay);
  }

  function startPasswordSneak() {
    clearTimers();
    closeEyes();
    applyEyePosition(0, 0);

    const delay = 1000 + Math.random() * 1800;
    prankTimer = setTimeout(function () {
      if (activeMode !== 'password') return;
      openEyes();
      animateTo(10, 7, 700);
      prankResetTimer = setTimeout(function () {
        if (activeMode !== 'password') return;
        animateTo(-10, -10, 80);
        tweenTimer = setTimeout(function () {
          if (activeMode !== 'password') return;
          closeEyes();
          applyEyePosition(0, 0);
          startPasswordSneak();
        }, 140);
      }, 700);
    }, delay);
  }

  function enableTextMode() {
    activeMode = 'text';
    restoreNormalTransition();
    startTextSneak();
  }

  function enablePasswordMode() {
    activeMode = 'password';
    restoreNormalTransition();
    startPasswordSneak();
  }

  function enableIdleMode() {
    activeMode = 'idle';
    clearTimers();
    openEyes();
    animateTo(0, 0, 160);
    idleLookWander();
  }

  function moveEyeWithMouse(eye, wrap, clientX, clientY) {
    const rect = wrap.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const max = 14;
    const distance = Math.min(max, Math.hypot(dx, dy) / 8);
    const angle = Math.atan2(dy, dx);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    eye.style.transform = `translate(${x}px, ${y}px)`;
  }

  document.addEventListener('mousemove', function (e) {
    if (activeMode !== 'idle') return;
    restoreNormalTransition();
    moveEyeWithMouse(eyeLeft, wrapLeft, e.clientX, e.clientY);
    moveEyeWithMouse(eyeRight, wrapRight, e.clientX, e.clientY);
  });

  document.addEventListener('mouseleave', function () {
    if (activeMode !== 'idle') return;
    animateTo(0, 0, 180);
  });

  textInputs.forEach(function (input) {
    input.addEventListener('focus', enableTextMode);
    input.addEventListener('blur', function () {
      setTimeout(function () {
        const focused = document.activeElement;
        if (!focused) {
          enableIdleMode();
          return;
        }
        if (focused.matches('input[type="password"]')) return;
        if (focused.matches('input[type="text"], input[type="number"]')) return;
        enableIdleMode();
      }, 0);
    });
  });

  passwordInputs.forEach(function (input) {
    input.addEventListener('focus', enablePasswordMode);
    input.addEventListener('blur', function () {
      setTimeout(function () {
        const focused = document.activeElement;
        if (!focused) {
          enableIdleMode();
          return;
        }
        if (focused.matches('input[type="password"]')) return;
        if (focused.matches('input[type="text"], input[type="number"]')) {
          enableTextMode();
          return;
        }
        enableIdleMode();
      }, 0);
    });
  });

  enableIdleMode();
})();