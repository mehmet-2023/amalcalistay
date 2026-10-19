// panel.js — QR tarama paneli (kamera + çerçeve görselleştirme + işaretleme popup'ı)
(function () {
  'use strict';

  var video = document.getElementById('camera');
  var overlay = document.getElementById('overlay');
  var octx = overlay.getContext('2d');
  var shutter = document.getElementById('shutter');
  var toastEl = document.getElementById('toast');
  var camError = document.getElementById('cam-error');
  var camErrorMsg = document.getElementById('cam-error-msg');
  var retryCam = document.getElementById('retry-cam');

  var sheetBackdrop = document.getElementById('sheet-backdrop');
  var personName = document.getElementById('person-name');
  var personKomite = document.getElementById('person-komite');
  var mealList = document.getElementById('meal-list');
  var sheetStatus = document.getElementById('sheet-status');
  var sheetClose = document.getElementById('sheet-close');

  var offCanvas = document.createElement('canvas');
  var offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

  var stream = null;
  var running = false;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var cssW = 0;
  var cssH = 0;

  var DETECT_INTERVAL = 140;
  var lastDetectTime = 0;

  var lastBox = null;        // { points: [...], factor }
  var lastResult = null;     // /api/scan sonucu { user, mealLabels, status }
  var currentCode = null;
  var openedCode = null;     // popup'ı en son açtığımız kod
  var lastSeenTime = 0;
  var busy = false;

  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast is-visible' + (kind ? ' ' + kind : '');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 2200);
  }

  function resize() {
    cssW = overlay.clientWidth;
    cssH = overlay.clientHeight;
    overlay.width = Math.round(cssW * dpr);
    overlay.height = Math.round(cssH * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);

    offCanvas.width = Math.max(1, Math.round(cssW / 2));
    offCanvas.height = Math.max(1, Math.round(cssH / 2));
  }

  function drawCover(ctx, targetW, targetH) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return;
    var scale = Math.max(targetW / vw, targetH / vh);
    var dw = vw * scale;
    var dh = vh * scale;
    ctx.drawImage(video, (targetW - dw) / 2, (targetH - dh) / 2, dw, dh);
  }

  function clearOverlay() {
    octx.clearRect(0, 0, cssW, cssH);
  }

  function isPending(result) {
    if (!result || !result.user) return false;
    var meals = result.user.meals;
    var taken = result.user.taken;
    return meals.some(function (entitled, i) { return entitled && !taken[i]; });
  }

  function drawBox(points, pending, name) {
    clearOverlay();
    var color = pending ? '#5bbd7a' : '#e2536b';
    var glow = pending ? 'rgba(91,189,122,0.55)' : 'rgba(226,83,107,0.55)';

    octx.save();
    octx.lineWidth = 4;
    octx.strokeStyle = color;
    octx.shadowColor = glow;
    octx.shadowBlur = 16;

    octx.beginPath();
    octx.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) octx.lineTo(points[i].x, points[i].y);
    octx.closePath();
    octx.stroke();

    octx.globalAlpha = 0.12;
    octx.fillStyle = color;
    octx.fill();
    octx.restore();

    // İsim etiketi (çerçevenin üstünde)
    if (name) {
      var minX = Infinity, minY = Infinity;
      points.forEach(function (p) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; });

      octx.save();
      octx.font = '600 17px Montserrat, sans-serif';
      var textW = octx.measureText(name).width;
      var padX = 12;
      var boxW = textW + padX * 2;
      var boxH = 34;
      var bx = Math.min(Math.max(minX, 8), cssW - boxW - 8);
      var by = Math.max(minY - boxH - 8, 8);

      octx.fillStyle = color;
      roundRect(octx, bx, by, boxW, boxH, 6);
      octx.fill();

      octx.fillStyle = '#200204';
      octx.textBaseline = 'middle';
      octx.fillText(name, bx + padX, by + boxH / 2 + 1);
      octx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function detectFrame() {
    if (!running || busy) return;
    if (!sheetBackdrop.classList.contains('is-hidden')) return;
    var now = performance.now();
    if (now - lastDetectTime < DETECT_INTERVAL) return;
    lastDetectTime = now;

    drawCover(offCtx, offCanvas.width, offCanvas.height);
    var imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    var code = window.jsQR(imageData.data, offCanvas.width, offCanvas.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code && code.data) {
      lastSeenTime = now;
      var factor = cssW / offCanvas.width;
      var loc = code.location;
      var pts = [
        { x: loc.topLeftCorner.x * factor, y: loc.topLeftCorner.y * factor },
        { x: loc.topRightCorner.x * factor, y: loc.topRightCorner.y * factor },
        { x: loc.bottomRightCorner.x * factor, y: loc.bottomRightCorner.y * factor },
        { x: loc.bottomLeftCorner.x * factor, y: loc.bottomLeftCorner.y * factor }
      ];
      lastBox = pts;
      handleCode(code.data, pts);
    } else {
      if (now - lastSeenTime > 450) {
        lastBox = null;
        lastResult = null;
        currentCode = null;
        clearOverlay();
      }
    }
  }

  function handleCode(text, pts) {
    if (text.indexOf('AMAL1.') !== 0) {
      // uyumlu olmayan QR
      drawBox(pts, true, null);
      return;
    }
    if (text === currentCode && lastResult) {
      drawBox(pts, isPending(lastResult), lastResult.user.name);
      return;
    }
    // Yeni kod: doğrula
    scanCode(text, pts);
  }

  function scanCode(text, pts) {
    busy = true;
    fetch('/api/scan', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: text })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        busy = false;
        if (r.status === 200 && r.data.ok) {
          currentCode = text;
          lastResult = r.data;
          if (navigator.vibrate) navigator.vibrate(35);
          drawBox(pts || lastBox, isPending(lastResult), lastResult.user.name);
          if (openedCode !== text) {
            openedCode = text;
            openSheet(lastResult);
          }
        } else if (r.status === 401) {
          window.location.replace('../index.html');
        } else {
          toast((r.data && r.data.error) || 'QR okunamadı', 'err');
        }
      })
      .catch(function () {
        busy = false;
        toast('Bağlantı hatası', 'err');
      });
  }

  /* ---- Popup (kişi kartı) ---- */
  function openSheet(result) {
    var user = result.user;
    personName.textContent = user.name || '—';
    personKomite.textContent = user.komite || 'Komite yok';
    renderMeals(result);
    sheetBackdrop.classList.remove('is-hidden');
  }

  function closeSheet() {
    sheetBackdrop.classList.add('is-hidden');
    clearOverlay();
    openedCode = null;
    currentCode = null;
    lastResult = null;
    lastBox = null;
  }

  function renderMeals(result) {
    var user = result.user;
    var labels = result.mealLabels || ['Öğle Yemeği 1', 'Öğle Yemeği 2'];
    mealList.innerHTML = '';

    var anyEntitled = false;
    user.meals.forEach(function (entitled, i) {
      if (!entitled) return;
      anyEntitled = true;

      var row = document.createElement('div');
      row.className = 'meal-row';

      var left = document.createElement('div');
      var label = document.createElement('span');
      label.className = 'meal-label';
      label.textContent = labels[i] || ('Öğün ' + (i + 1));
      var state = document.createElement('span');
      state.className = 'meal-state ' + (user.taken[i] ? 'state-taken' : 'state-pending');
      state.textContent = user.taken[i] ? 'Alındı' : 'Alınmadı';
      left.appendChild(label);
      left.appendChild(state);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small toggle-btn ' + (user.taken[i] ? 'danger' : '');
      btn.textContent = user.taken[i] ? 'Geri Al' : 'Alındı İşaretle';
      btn.addEventListener('click', function () {
        markMeal(user.id, i, !user.taken[i]);
      });

      row.appendChild(left);
      row.appendChild(btn);
      mealList.appendChild(row);
    });

    if (!anyEntitled) {
      var none = document.createElement('div');
      none.className = 'notice warn center';
      none.textContent = 'Bu kişinin tanımlı yemek hakkı yok.';
      mealList.appendChild(none);
    }

    var pending = isPending(result);
    sheetStatus.className = 'sheet-status ' + (pending ? 'pending' : 'done');
    sheetStatus.textContent = pending ? 'Yemek hakkı bekliyor' : 'Tüm yemekler alındı';
  }

  function markMeal(id, index, value) {
    fetch('/api/mark', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, index: index, value: value })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          lastResult = r.data;
          if (navigator.vibrate) navigator.vibrate(20);
          renderMeals(r.data);
          toast(value ? 'Alındı olarak işaretlendi' : 'İşaret geri alındı', 'ok');
        } else if (r.status === 401) {
          window.location.replace('../index.html');
        } else {
          toast((r.data && r.data.error) || 'İşaretlenemedi', 'err');
        }
      })
      .catch(function () {
        toast('Bağlantı hatası', 'err');
      });
  }

  /* ---- Kamera ---- */
  function startCamera() {
    camError.classList.add('is-hidden');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camErrorMsg.textContent = 'Bu tarayıcı kamera erişimini desteklemiyor.';
      camError.classList.remove('is-hidden');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        return video.play().catch(function () {});
      })
      .then(function () {
        running = true;
        resize();
        loop();
      })
      .catch(function (err) {
        camErrorMsg.textContent = 'Kamera açılamadı: ' + (err && err.message ? err.message : 'izin gerekli');
        camError.classList.remove('is-hidden');
      });
  }

  function loop() {
    if (!running) return;
    detectFrame();
    window.requestAnimationFrame(loop);
  }

  /* ---- Olaylar ---- */
  shutter.addEventListener('click', function () {
    if (busy) return;
    if (currentCode) {
      openedCode = currentCode;
      if (lastResult) openSheet(lastResult);
      return;
    }
    // Anlık kareyi tara
    drawCover(offCtx, offCanvas.width, offCanvas.height);
    var imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
    var code = window.jsQR(imageData.data, offCanvas.width, offCanvas.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      var factor = cssW / offCanvas.width;
      var loc = code.location;
      var pts = [
        { x: loc.topLeftCorner.x * factor, y: loc.topLeftCorner.y * factor },
        { x: loc.topRightCorner.x * factor, y: loc.topRightCorner.y * factor },
        { x: loc.bottomRightCorner.x * factor, y: loc.bottomRightCorner.y * factor },
        { x: loc.bottomLeftCorner.x * factor, y: loc.bottomLeftCorner.y * factor }
      ];
      lastBox = pts;
      scanCode(code.data, pts);
    } else {
      toast('QR kod bulunamadı', 'err');
    }
  });

  sheetClose.addEventListener('click', closeSheet);
  sheetBackdrop.addEventListener('click', function (e) {
    if (e.target === sheetBackdrop) closeSheet();
  });
  retryCam.addEventListener('click', startCamera);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
    } else if (stream) {
      running = true;
      loop();
    }
  });

  // Guard bitince kamerayı başlat
  window.AMAL_GUARD_READY.then(function (r) {
    if (r && r.ok) startCamera();
  });
})();
