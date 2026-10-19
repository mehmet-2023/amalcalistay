// panel.js — QR tarama paneli (kamera + çerçeve görselleştirme + işaretleme popup'ı)
(function () {
  'use strict';

  var video = document.getElementById('camera');
  var overlay = document.getElementById('overlay');
  var octx = overlay.getContext('2d');
  var toastEl = document.getElementById('toast');
  var camError = document.getElementById('cam-error');
  var camErrorMsg = document.getElementById('cam-error-msg');
  var retryCam = document.getElementById('retry-cam');

  var sheetBackdrop = document.getElementById('sheet-backdrop');
  var personName = document.getElementById('person-name');
  var personKomite = document.getElementById('person-komite');
  var mealArea = document.getElementById('meal-area');
  var sheetStatus = document.getElementById('sheet-status');
  var confirmEl = document.getElementById('confirm');
  var sheetCloseX = document.getElementById('sheet-close-x');

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

  // Yeşil: şu an verilebilecek öğün var; kırmızı: şu an öğün yok (aldı veya kilitli).
  function isPending(result) {
    if (!result) return false;
    if (Array.isArray(result.available)) return result.available.length > 0;
    if (result.status) return result.status === 'pending';
    if (!result.user) return false;
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
    if (sheetBackdrop.classList.contains('is-open')) return;
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
          window.location.replace('../');
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
    confirmEl.classList.remove('is-visible');
    renderNext(result);
    sheetBackdrop.classList.add('is-open');
  }

  function closeSheet() {
    sheetBackdrop.classList.remove('is-open');
    confirmEl.classList.remove('is-visible');
    clearOverlay();
    openedCode = null;
    currentCode = null;
    lastResult = null;
    lastBox = null;
  }

  function formatRemaining(iso) {
    var ms = Date.parse(iso) - Date.now();
    if (!isFinite(ms) || ms <= 0) return 'az sonra';
    var totalMin = Math.ceil(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h > 0) return h + ' saat ' + (m > 0 ? m + ' dakika' : '');
    return m + ' dakika';
  }

  // Sıradaki müsait öğünü göster; 3 saat kilitliyse bekleme bilgisi ver.
  function renderNext(result) {
    var user = result.user;
    var labels = result.mealLabels || ['Öğle Yemeği 1', 'Öğle Yemeği 2'];
    mealArea.innerHTML = '';

    var available = Array.isArray(result.available) ? result.available : [];
    var nextIndex = available.length ? available[0] : -1;
    var anyEntitled = Array.isArray(result.anyEntitled)
      ? result.anyEntitled
      : user.meals.some(function (m) { return m; });

    if (nextIndex !== -1) {
      var row = document.createElement('div');
      row.className = 'meal-row next';

      var label = document.createElement('span');
      label.className = 'meal-label';
      label.textContent = labels[nextIndex] || ('Öğün ' + (nextIndex + 1));
      var state = document.createElement('span');
      state.className = 'meal-state state-pending';
      state.textContent = 'Alınmadı';
      row.appendChild(label);
      row.appendChild(state);
      mealArea.appendChild(row);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn big-approve';
      btn.textContent = 'YEMEĞİ ONAYLA';
      btn.addEventListener('click', function () {
        markMeal(user.id, nextIndex, btn);
      });
      mealArea.appendChild(btn);
    } else if (result.lockUntil) {
      var lock = document.createElement('div');
      lock.className = 'notice warn center';
      lock.textContent = '2. öğün kilitli: ' + formatRemaining(result.lockUntil) + ' sonra açılacak.';
      mealArea.appendChild(lock);
      mealArea.appendChild(closeButton());
    } else if (anyEntitled) {
      var done = document.createElement('div');
      done.className = 'notice warn center';
      done.textContent = 'Bu kişi tüm yemeklerini aldı.';
      mealArea.appendChild(done);
      mealArea.appendChild(closeButton());
    } else {
      var noRight = document.createElement('div');
      noRight.className = 'notice warn center';
      noRight.textContent = 'Bu kişinin tanımlı yemek hakkı yok.';
      mealArea.appendChild(noRight);
      mealArea.appendChild(closeButton());
    }

    var status = result.status || (nextIndex !== -1 ? 'pending' : 'done');
    sheetStatus.className = 'sheet-status ' + (status === 'pending' ? 'pending' : 'done');
    sheetStatus.textContent = status === 'pending'
      ? 'Yemek hakkı bekliyor'
      : status === 'locked'
        ? 'Öğün 2 kilitli'
        : 'Yemek hakkı kalmadı';
  }

  function closeButton() {
    var actions = document.createElement('div');
    actions.className = 'sheet-actions';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn ghost small';
    btn.textContent = 'Kapat';
    btn.addEventListener('click', closeSheet);
    actions.appendChild(btn);
    return actions;
  }

  function markMeal(id, index, btn) {
    btn.disabled = true;
    btn.textContent = 'ONAYLANIYOR...';
    fetch('/api/mark', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, index: index, value: true })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.data.ok) {
          lastResult = r.data;
          if (navigator.vibrate) navigator.vibrate(30);
          confirmEl.classList.add('is-visible');
          setTimeout(closeSheet, 1150);
        } else if (r.status === 401) {
          window.location.replace('../');
        } else {
          btn.disabled = false;
          btn.textContent = 'YEMEĞİ ONAYLA';
          toast((r.data && r.data.error) || 'İşaretlenemedi', 'err');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'YEMEĞİ ONAYLA';
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
  sheetCloseX.addEventListener('click', closeSheet);
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
