/* ============================================================
   《家书·回声》动效层 fx.js
   - 序厅标题逐字入场
   - 序厅/尾声浮尘粒子（canvas）
   - 滚动渐显（IntersectionObserver + 动态卡片接管）
   ============================================================ */
(function () {
'use strict';

var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 1. 序厅标题逐字入场 ---------- */
function splitTitle() {
  document.querySelectorAll('.landing-title').forEach(function (t) {
    if (t.dataset.split) return;
    t.dataset.split = '1';
    var frag = document.createDocumentFragment();
    var i = 0;
    Array.prototype.slice.call(t.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        Array.prototype.slice.call(n.textContent).forEach(function (ch) {
          if (!ch.trim()) { frag.appendChild(document.createTextNode(ch)); return; }
          var s = document.createElement('span');
          s.className = 'ch';
          s.textContent = ch;
          s.style.animationDelay = (0.15 + i * 0.09) + 's';
          frag.appendChild(s);
          i++;
        });
      } else if (n.nodeType === 1) {
        n.classList.add('ch');
        n.style.animationDelay = (0.15 + i * 0.09) + 's';
        frag.appendChild(n);
        i++;
      }
    });
    t.innerHTML = '';
    t.appendChild(frag);
  });
}

/* ---------- 2. 浮尘粒子 ---------- */
function particles(canvas, opt) {
  if (!canvas || reduceMotion) return;
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, dots = [];
  var COUNT = opt.count || 52;

  function resize() {
    var host = canvas.parentNode;
    W = host.clientWidth; H = host.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function make() {
    dots = [];
    for (var i = 0; i < COUNT; i++) {
      dots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * (opt.rMax || 2.4) + 0.5,
        vy: -(Math.random() * 0.22 + 0.05),
        vx: (Math.random() - 0.5) * 0.18,
        a: Math.random() * 0.5 + 0.12,
        tw: Math.random() * Math.PI * 2,
        tws: Math.random() * 0.018 + 0.004
      });
    }
  }
  function frame() {
    if (!W || !H) { resize(); make(); }
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.x += d.vx; d.y += d.vy; d.tw += d.tws;
      if (d.y < -8) { d.y = H + 8; d.x = Math.random() * W; }
      if (d.x < -8) d.x = W + 8;
      if (d.x > W + 8) d.x = -8;
      var alpha = d.a * (0.55 + 0.45 * Math.sin(d.tw));
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = opt.color(alpha);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  resize(); make();
  window.addEventListener('resize', function () { resize(); make(); });
  requestAnimationFrame(frame);
}

/* ---------- 3. 滚动渐显 ---------- */
/* 渐显仅用于卡片装饰类；功能/信息主体直接显示，杜绝隐形风险 */
var revealSel = [
  '.letter-card', '.wall-card',
  '.epilogue-list', '.epilogue-line', '.epilogue-qinghai', '.epilogue-actions'
].join(',');

var io = null;
if ('IntersectionObserver' in window && !reduceMotion) {
  io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) {
        en.target.classList.add('reveal-in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
}

function scan(root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll(revealSel);
  Array.prototype.forEach.call(nodes, function (el, i) {
    if (el.classList.contains('reveal') || el.classList.contains('reveal-in')) return;
    if (reduceMotion) return;
    el.classList.add('reveal');
    el.style.transitionDelay = (Math.min(i % 6, 5) * 70) + 'ms';
    if (io) io.observe(el);
    else el.classList.add('reveal-in');
  });
}

/* 动态内容（卡片墙重渲染、回信墙增删）自动接管 */
function watchDynamic() {
  if (!('MutationObserver' in window)) return;
  ['#letter-grid', '#wall-grid', '#epilogue-list', '#about-sources'].forEach(function (sel) {
    var host = document.querySelector(sel);
    if (!host) return;
    var mo = new MutationObserver(function (muts) {
      var touched = muts.some(function (m) { return m.addedNodes.length > 0; });
      if (touched) scan(host.parentNode || document);
    });
    mo.observe(host, { childList: true, subtree: true });
  });
}

/* ---------- 4. 启动 ---------- */
function boot() {
  splitTitle();
  scan(document);
  watchDynamic();

  /* 渐显兜底：任何情况下 1.6s 后内容必须可见 */
  setTimeout(function () {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal:not(.reveal-in)'), function (el) {
      el.classList.add('reveal-in');
    });
  }, 1600);
  /* 标题逐字动画兜底：2s 后强制可见 */
  setTimeout(function () {
    Array.prototype.forEach.call(document.querySelectorAll('.landing-title .ch'), function (el) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }, 2000);
  /* 序厅入场元素兜底：动画停摆时仍须可见 */
  setTimeout(function () {
    ['.landing-quote', '.landing-sub', '#enter-btn', '.scroll-hint', '.landing-seal'].forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        el.style.animation = 'none';
        el.style.opacity = '1';
      });
    });
  }, 2200);

  particles(document.getElementById('fx-canvas'), {
    count: 56, rMax: 2.6,
    color: function (a) { return 'rgba(231,201,142,' + a.toFixed(3) + ')'; }
  });

  var epi = document.getElementById('view-epilogue');
  if (epi) {
    var c = document.createElement('canvas');
    c.className = 'fx-canvas';
    c.setAttribute('aria-hidden', 'true');
    epi.insertBefore(c, epi.firstChild);
    particles(c, {
      count: 40, rMax: 2.0,
      color: function (a) { return 'rgba(224,120,90,' + a.toFixed(3) + ')'; }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
