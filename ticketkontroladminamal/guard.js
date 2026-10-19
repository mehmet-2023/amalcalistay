// guard.js — korumalı sayfalar için oturum kontrolü
// Giriş yoksa ana sayfaya yönlendirir (data-unauth ile özelleştirilebilir).
(function () {
  'use strict';

  var script = document.querySelector('script[src*="guard.js"]');
  var unauthTarget = (script && script.getAttribute('data-unauth')) || '../';

  var loader = document.createElement('div');
  loader.className = 'hidden-loader';
  loader.textContent = 'Doğrulanıyor';
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(loader);
  });

  window.AMAL_GUARD_READY = fetch('/api/auth/verify', { credentials: 'include', cache: 'no-store' })
    .then(function (res) {
      if (res.ok) return res.json();
      return { ok: false };
    })
    .then(function (data) {
      if (data && data.ok) {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
        document.body.classList.add('auth-ready');
        return { ok: true, user: data.user };
      }
      window.location.replace(unauthTarget);
      return { ok: false };
    })
    .catch(function () {
      window.location.replace(unauthTarget);
      return { ok: false };
    });

  window.addEventListener('DOMContentLoaded', function () {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'logout-fab';
    btn.textContent = 'Çıkış Yap';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .catch(function () {})
        .then(function () { window.location.replace('amalbest'); });
    });
    window.AMAL_GUARD_READY.then(function (r) {
      if (r && r.ok) document.body.appendChild(btn);
    });
  });
})();
