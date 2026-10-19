// login.js — giriş sayfası mantığı
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var userInput = document.getElementById('username');
  var passInput = document.getElementById('password');
  var submitBtn = document.getElementById('login-submit');
  var errorBox = document.getElementById('login-error');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('is-hidden');
  }

  function hideError() {
    errorBox.classList.add('is-hidden');
    errorBox.textContent = '';
  }

  function nextTarget() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get('next');
    if (next && /^[a-zA-Z0-9._-]+\.html$/.test(next)) return next;
    return 'panel.html';
  }

  // Zaten giriş yapılmışsa doğrudan panele yönlendir
  fetch('/api/auth/verify', { credentials: 'include', cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : { ok: false }; })
    .then(function (d) {
      if (d && d.ok) window.location.replace(nextTarget());
    })
    .catch(function () {});

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    hideError();

    var username = userInput.value.trim();
    var password = passInput.value;
    if (!username || !password) {
      showError('Lütfen tüm alanları doldurun.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Doğrulanıyor...';

    fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status === 200 && result.data.ok) {
          passInput.value = '';
          window.location.replace(nextTarget());
          return;
        }
        showError((result.data && result.data.error) || 'Kullanıcı adı veya şifre hatalı.');
        passInput.value = '';
        passInput.focus();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Giriş Yap';
      })
      .catch(function () {
        showError('Bağlantı hatası. Lütfen tekrar deneyin.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Giriş Yap';
      });
  });
})();
