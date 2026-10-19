// users.js — kullanıcı yönetimi (oluştur / düzenle / sil / QR)
(function () {
  'use strict';

  var createForm = document.getElementById('create-form');
  var nameInput = document.getElementById('c-name');
  var komiteInput = document.getElementById('c-komite');
  var meal1Input = document.getElementById('c-meal1');
  var meal2Input = document.getElementById('c-meal2');
  var createBtn = document.getElementById('create-btn');

  var listEl = document.getElementById('user-list');
  var countEl = document.getElementById('user-count');
  var refreshBtn = document.getElementById('refresh-btn');
  var bulkQrBtn = document.getElementById('bulk-qr-btn');

  var writeWarning = document.getElementById('write-warning');
  var pageError = document.getElementById('page-error');
  var toastEl = document.getElementById('toast');

  var qrBackdrop = document.getElementById('qr-backdrop');
  var qrImage = document.getElementById('qr-image');
  var qrName = document.getElementById('qr-name');
  var qrClose = document.getElementById('qr-close');
  var qrOpen = document.getElementById('qr-open');

  var state = {
    users: [],
    mealLabels: ['Öğle Yemeği 1', 'Öğle Yemeği 2'],
    writeConfigured: false
  };

  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'toast is-visible' + (kind ? ' ' + kind : '');
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () {
      toastEl.classList.remove('is-visible');
    }, 2400);
  }

  function showError(msg) {
    pageError.textContent = msg;
    pageError.classList.remove('is-hidden');
  }

  function clearError() {
    pageError.classList.add('is-hidden');
    pageError.textContent = '';
  }

  function api(path, options) {
    return fetch(path, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, options || {})).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function loadUsers() {
    clearError();
    listEl.innerHTML = '';
    var loading = document.createElement('div');
    loading.className = 'empty';
    loading.textContent = 'Yükleniyor';
    listEl.appendChild(loading);

    api('/api/users', { method: 'GET' })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('../'); return; }
        if (r.status !== 200 || !r.data.ok) {
          showError((r.data && r.data.error) || 'Kullanıcılar yüklenemedi');
          listEl.innerHTML = '';
          return;
        }
        state.users = r.data.users || [];
        state.mealLabels = r.data.mealLabels || state.mealLabels;
        state.writeConfigured = !!r.data.writeConfigured;
        writeWarning.classList.toggle('is-hidden', state.writeConfigured);
        render();
      })
      .catch(function () {
        showError('Bağlantı hatası');
        listEl.innerHTML = '';
      });
  }

  function mealState(user, i) {
    if (!user.meals[i]) return 0;      // hak yok
    if (user.taken[i]) return 2;       // alındı
    return 1;                          // alınmadı
  }

  function render() {
    countEl.textContent = String(state.users.length);
    listEl.innerHTML = '';

    if (!state.users.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Henüz kullanıcı yok';
      listEl.appendChild(empty);
      return;
    }

    state.users.forEach(function (user) {
      var row = document.createElement('div');
      row.className = 'user-row';

      var info = document.createElement('div');
      var name = document.createElement('span');
      name.className = 'u-name';
      name.textContent = user.name;
      var komite = document.createElement('span');
      komite.className = 'u-komite';
      komite.textContent = user.komite || 'Komite yok';
      info.appendChild(name);
      info.appendChild(komite);

      var meals = document.createElement('div');
      meals.className = 'u-meals';
      [0, 1].forEach(function (i) {
        var st = mealState(user, i);
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'meal-chip ' + (st === 0 ? 'no-right' : st === 2 ? 'taken' : 'pending');
        chip.textContent = 'Ö' + (i + 1) + ': ' + (st === 0 ? 'Hak yok' : st === 2 ? 'Alındı' : 'Alınmadı');
        chip.addEventListener('click', function () { cycleMeal(user, i); });
        meals.appendChild(chip);
      });

      var actions = document.createElement('div');
      actions.className = 'u-actions';

      var qrBtn = document.createElement('button');
      qrBtn.type = 'button';
      qrBtn.className = 'btn ghost small';
      qrBtn.textContent = 'QR';
      qrBtn.addEventListener('click', function () { openQr(user); });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn danger small';
      delBtn.textContent = 'Sil';
      delBtn.addEventListener('click', function () { removeUser(user); });

      actions.appendChild(qrBtn);
      actions.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(meals);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  function cycleMeal(user, i) {
    if (!state.writeConfigured) { toast('Yazma yapılandırması eksik', 'err'); return; }
    var cur = mealState(user, i);
    var next = (cur + 1) % 3;

    var meals = user.meals.slice();
    var taken = user.taken.slice();
    meals[i] = next > 0;
    taken[i] = next === 2;

    patchUser(user.id, { meals: meals, taken: taken });
  }

  function patchUser(id, body) {
    api('/api/users/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('../'); return; }
        if (r.status === 200 && r.data.ok) {
          var idx = state.users.findIndex(function (u) { return u.id === id; });
          if (idx !== -1) state.users[idx] = r.data.user;
          render();
        } else {
          toast((r.data && r.data.error) || 'Güncellenemedi', 'err');
        }
      })
      .catch(function () { toast('Bağlantı hatası', 'err'); });
  }

  function removeUser(user) {
    if (!state.writeConfigured) { toast('Yazma yapılandırması eksik', 'err'); return; }
    if (!window.confirm('"' + user.name + '" silinsin mi?')) return;
    api('/api/users/' + encodeURIComponent(user.id), { method: 'DELETE' })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('../'); return; }
        if (r.status === 200 && r.data.ok) {
          state.users = state.users.filter(function (u) { return u.id !== user.id; });
          render();
          toast('Kullanıcı silindi', 'ok');
        } else {
          toast((r.data && r.data.error) || 'Silinemedi', 'err');
        }
      })
      .catch(function () { toast('Bağlantı hatası', 'err'); });
  }

  function openQr(user) {
    qrName.textContent = user.name;
    qrImage.src = '/api/qr?id=' + encodeURIComponent(user.id) + '&t=' + Date.now();
    qrOpen.href = '/api/qr?id=' + encodeURIComponent(user.id);
    qrBackdrop.classList.remove('is-hidden');
  }

  /* ---- Toplu QR → Excel (her satır: isim + QR resmi) ---- */
  function downloadBulkQr() {
    if (!state.users.length) { toast('Kullanıcı yok', 'err'); return; }
    if (bulkQrBtn.disabled) return;

    bulkQrBtn.disabled = true;
    var label = bulkQrBtn.textContent;
    bulkQrBtn.textContent = 'Hazırlanıyor...';

    api('/api/qr-bulk', { method: 'POST' })
      .then(function (r) {
        if (r.status === 401) { window.location.replace('../'); return; }
        if (r.status !== 200 || !r.data.ok || !r.data.dataUrl) {
          toast((r.data && r.data.error) || 'Excel oluşturulamadı', 'err');
          return;
        }
        var a = document.createElement('a');
        a.href = r.data.dataUrl;
        a.download = r.data.filename || 'amal-qr-kodlari.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast(state.users.length + ' kişilik Excel indirildi', 'ok');
      })
      .catch(function () { toast('Bağlantı hatası', 'err'); })
      .then(function () {
        bulkQrBtn.disabled = false;
        bulkQrBtn.textContent = label;
      });
  }

  createForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!state.writeConfigured) { toast('Yazma yapılandırması eksik', 'err'); return; }

    var name = nameInput.value.trim();
    if (!name) return;

    createBtn.disabled = true;
    createBtn.textContent = 'Ekleniyor...';

    api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        komite: komiteInput.value.trim(),
        meals: [meal1Input.checked, meal2Input.checked]
      })
    })
      .then(function (r) {
        createBtn.disabled = false;
        createBtn.textContent = 'Kullanıcı Ekle';
        if (r.status === 401) { window.location.replace('../'); return; }
        if (r.status === 201 && r.data.ok) {
          state.users.push(r.data.user);
          state.users.sort(function (a, b) { return a.name.localeCompare(b.name, 'tr'); });
          render();
          nameInput.value = '';
          komiteInput.value = '';
          toast('Kullanıcı eklendi', 'ok');
        } else {
          toast((r.data && r.data.error) || 'Eklenemedi', 'err');
        }
      })
      .catch(function () {
        createBtn.disabled = false;
        createBtn.textContent = 'Kullanıcı Ekle';
        toast('Bağlantı hatası', 'err');
      });
  });

  refreshBtn.addEventListener('click', loadUsers);
  if (bulkQrBtn) bulkQrBtn.addEventListener('click', downloadBulkQr);
  qrClose.addEventListener('click', function () { qrBackdrop.classList.add('is-hidden'); });
  qrBackdrop.addEventListener('click', function (e) {
    if (e.target === qrBackdrop) qrBackdrop.classList.add('is-hidden');
  });

  window.AMAL_GUARD_READY.then(function (r) {
    if (r && r.ok) loadUsers();
  });
})();
