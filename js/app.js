/* ============ 《家书·回声》app.js ============ */
(function () {
'use strict';

/* ---------- 状态 ---------- */
let LETTERS = [];
const RATES = [0.75, 1.0, 1.25];
let rateIdx = 1;
let audioReady = false;   // 预生成音频是否可用

const tts = {
  idx: -1,          // 当前朗读句下标
  playing: false,
  paused: false,
  mode: 'native',   // 'audio' = 预生成 mp3 | 'native' = 浏览器 TTS
  audio: null,      // 当前 Audio 对象
};

const $ = (id) => document.getElementById(id);
const views = {
  landing: $('view-landing'), letters: $('view-letters'), reader: $('view-reader'),
  timeline: $('view-timeline'),
  wall: $('view-wall'), epilogue: $('view-epilogue'), about: $('view-about'),
};

/* ---------- 路由 ---------- */
function route() {
  const hash = location.hash || '#/';
  const parts = hash.slice(2).split('/').filter(Boolean);
  stopTTS();
  hideAnno();
  closeSide();

  let name = 'landing';
  if (parts[0] === 'letters') name = 'letters';
  else if (parts[0] === 'letter') name = 'reader';
  else if (parts[0] === 'timeline') name = 'timeline';
  else if (parts[0] === 'wall') name = 'wall';
  else if (parts[0] === 'epilogue') name = 'epilogue';
  else if (parts[0] === 'about') name = 'about';

  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
  $('site-header').classList.toggle('hidden', name === 'landing');

  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
  const navMap = { letters: 'letters', reader: 'letters', timeline: 'timeline', wall: 'wall', about: 'about' };
  const active = document.querySelector(`[data-nav="${navMap[name]}"]`);
  if (active) active.classList.add('active');
  $('mobile-nav').classList.add('hidden');

  if (name === 'letters') renderGrid(currentEra);
  if (name === 'reader') renderReader(parts[1] || '01');
  if (name === 'timeline') renderTimeline();
  if (name === 'wall') renderWall();
  if (name === 'epilogue') renderEpilogue();
  if (name === 'about') renderAbout();

  const flash = $('route-flash');
  if (flash) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }

  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- 数据 ---------- */
async function load() {
  try {
    const res = await fetch('data/letters.json');
    LETTERS = (await res.json()).letters;
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<div style="text-align:center;padding:80px 20px;font-size:15px;line-height:2">' +
      '请通过本地服务器打开本页（如 <code>python3 -m http.server</code>），<br>直接双击 HTML 无法加载数据文件。</div>';
    throw e;
  }
  // 探测预生成音频（01 封第一句）
  try {
    const head = await fetch('audio/01/00.mp3', { method: 'HEAD' });
    audioReady = head.ok;
  } catch (e) { audioReady = false; }
  // 回声文案库
  try {
    const r = await fetch('data/replies.json');
    REPLIES = await r.json();
  } catch (e) { REPLIES = null; }
}

/* ---------- 背景音乐（进入后播放，朗读时自动压低） ---------- */
const BGM = new Audio('audio/bgm.mp3');
BGM.loop = true; BGM.volume = 0.22;
let bgmOn = true;
try { bgmOn = localStorage.getItem('jiashu-bgm') !== 'off'; } catch (e) {}
function startBGM() {
  if (!bgmOn) return;
  const p = BGM.play();
  if (p && p.catch) p.catch(() => {});
}
function bgmDuck(v) { try { BGM.volume = v; } catch (e) {} }
$('bgm-toggle').addEventListener('click', () => {
  bgmOn = !bgmOn;
  try { localStorage.setItem('jiashu-bgm', bgmOn ? 'on' : 'off'); } catch (e) {}
  $('bgm-toggle').classList.toggle('muted', !bgmOn);
  if (bgmOn) startBGM(); else BGM.pause();
});
if (!bgmOn) $('bgm-toggle').classList.add('muted');

/* ---------- 序厅 ---------- */
$('enter-btn').addEventListener('click', () => { location.hash = '#/letters'; startBGM(); });
document.querySelector('#view-landing').addEventListener('wheel', (e) => {
  if (e.deltaY > 30) { location.hash = '#/letters'; startBGM(); }
}, { passive: true });

/* ---------- 卡片墙 ---------- */
let currentEra = '全部';
function renderGrid(era) {
  currentEra = era;
  if (!LETTERS.length) {
    $('letter-grid').innerHTML = '<div class="wall-empty">正在展开信笺…</div>';
    return;
  }
  const eras = ['全部', ...new Set(LETTERS.map(l => l.era))];
  $('era-filters').innerHTML = eras.map(e =>
    `<button data-era="${e}" class="${e === era ? 'on' : ''}">${e}</button>`).join('');
  const list = LETTERS.filter(l => era === '全部' || l.era === era);
  $('letter-grid').innerHTML = list.map(l => `
    <article class="letter-card ${l.isQinghai ? 'qinghai' : ''}" data-id="${l.id}">
      <div class="lc-photo"><img src="images/portraits/${l.id}.jpg" alt="${l.author} 肖像" loading="lazy"
        style="object-position:${l.portraitPos || '50% 20%'}"
        onerror="this.style.display='none'"></div>
      <div class="lc-body">
        <span class="no">NO.${l.id}</span>
        <div class="lc-author">${l.author}</div>
        <div class="lc-to">致 ${l.recipient}</div>
        <span class="lc-year">${l.year} · ${l.era}</span>
        <p class="lc-excerpt">“${l.excerpt}”</p>
      </div>
      <span class="lc-play">▶ 听他/她说</span>
      <span class="lc-badge${l.isQinghai ? ' qinghai' : ''}">${l.province || ''}</span>
    </article>`).join('');

  // 继续上次阅读
  const old = document.getElementById('resume-bar');
  if (old) old.remove();
  let lastId = null;
  try { lastId = localStorage.getItem('jiashu-last-read'); } catch (e) {}
  const last = lastId && LETTERS.find(x => x.id === lastId);
  const hint = document.querySelector('.tour-hint');
  if (last && hint) {
    const bar = document.createElement('div');
    bar.className = 'resume-bar';
    bar.id = 'resume-bar';
    bar.innerHTML = `<span>继续上次阅读</span><b>NO.${last.id} ${last.author}</b><span class="go">展读 →</span>`;
    bar.addEventListener('click', () => { location.hash = `#/letter/${last.id}`; });
    hint.parentNode.insertBefore(bar, hint.nextSibling);
  }
}
$('era-filters').addEventListener('click', e => {
  const b = e.target.closest('button'); if (b) renderGrid(b.dataset.era);
});
$('letter-grid').addEventListener('click', e => {
  const card = e.target.closest('.letter-card');
  if (card) location.hash = `#/letter/${card.dataset.id}`;
});

/* ---------- 阅读页 ---------- */
let cur = null;

function renderReader(id) {
  cur = LETTERS.find(l => l.id === id) || LETTERS[0];
  const i = LETTERS.indexOf(cur);
  $('reader-no').textContent = `NO.${cur.id} / ${String(LETTERS.length).padStart(2, '0')}`;
  $('reader-title').textContent = `${cur.author} 致 ${cur.recipient}`;
  $('reader-date').textContent = `${cur.title} · ${cur.date}`;

  $('letter-paper').innerHTML =
    (cur.modernRead ? `<div class="modern-read"><span class="mr-tag">今读</span>${cur.modernRead}</div>` : '') +
    cur.sentences.map((s, k) => {
    let html = escapeHTML(s);
    cur.annotations.forEach((a, ai) => {
      const t = escapeRegExp(a.term);
      html = html.replace(new RegExp(t, 'g'),
        `<span class="anno-term" data-anno="${ai}">${a.term}</span>`);
    });
    const narration = html.startsWith('（') || html.startsWith('——');
    return `<span class="sent${narration ? ' narration' : ''}" data-i="${k}">${html}</span>`;
  }).join('') +
    (cur.fate ? `<div class="fate-bar">⌛ ${cur.fate}</div>` : '') +
    playerHTML();

  $('reader-side').innerHTML = `
    <button class="side-toggle" id="side-toggle-btn">▲ 背景与结局</button>
    <div class="side-portrait">
      <div class="ph"><img src="images/portraits/${cur.id}.jpg"
        alt="${cur.author} 肖像" loading="lazy" width="56" height="70"
        style="width:56px;height:70px;max-width:56px;max-height:70px;object-position:${cur.portraitPos || '50% 20%'}"
        onerror="this.style.display='none';this.parentNode.textContent='肖像待补'"></div>
      <div class="info"><b>${cur.author}</b><p>${cur.authorLife}</p><p>致 ${cur.recipient}</p><p class="side-prov">籍贯 · ${cur.province || ''}</p></div>
    </div>
    <div class="side-block"><h4>▍背景</h4><p>${cur.context.background}</p></div>
    <div class="side-block"><h4>▍结局</h4><p>${cur.context.ending}</p></div>
    ${cur.recipientAfter ? `<div class="side-block"><h4>▍收信人后来</h4><p>${cur.recipientAfter}</p></div>` : ''}
    ${cur.relatedId ? `<div class="side-block"><h4>▍相关信件</h4><p><a class="related-link" href="#/letter/${cur.relatedId}">革命伉俪的另一封遗书 · ${((LETTERS.find(x => x.id === cur.relatedId) || {}).author) || ''} →</a></p></div>` : ''}
    <div class="side-extra">
      <div class="archive-line"><b>著录形态</b>：${cur.extent || '据权威版本著录'}</div>
      <div class="archive-line"><b>原件与档案</b>：${cur.manuscript || '详见著录出处'}</div>
      <div class="${cur.isFragment ? 'frag' : ''}">史料出处：${cur.source}</div>
      ${cur.fragmentNote ? `<div class="frag">※ ${cur.fragmentNote}</div>` : ''}
      <div>朗读：AI 语音预生成（edge-tts）</div>
      <div class="portrait-note">肖像来源：新华社/纪念馆/党媒标准像（详见关于页）</div>
    </div>`;

  const prev = LETTERS[i - 1], next = LETTERS[i + 1];
  setPager($('prev-letter'), prev, '← 上一封');
  setPager($('next-letter'), next, '下一封 →');

  tts.idx = -1; tts.playing = false; tts.paused = false;
  updatePlayerUI();

  // 已读记录 + 最近阅读（供时间轴高亮与"继续上次阅读"）
  try {
    const read = JSON.parse(localStorage.getItem('jiashu-read') || '[]');
    if (!read.includes(cur.id)) {
      read.push(cur.id);
      localStorage.setItem('jiashu-read', JSON.stringify(read));
    }
    localStorage.setItem('jiashu-last-read', cur.id);
  } catch (e) {}
}
function setPager(el, target, label) {
  el.innerHTML = label;
  if (target) { el.href = `#/letter/${target.id}`; el.classList.remove('off'); }
  else { el.removeAttribute('href'); el.classList.add('off'); }
}
function playerHTML() {
  return `<div class="player" id="player">
    <button id="play-btn" class="play-btn" aria-label="播放">▶</button>
    <div class="progress" id="progress"><div class="progress-fill" id="progress-fill"></div></div>
    <span class="time" id="time-label">00:00</span>
    <button id="rate-btn" class="rate-btn">1.0x</button>
    <button id="restart-btn" class="restart-btn" aria-label="重播">↺</button>
    <span class="engine-badge" id="engine-badge" title="朗读引擎"></span>
  </div>`;
}

/* ---------- 朗读引擎：预生成音频优先，原生 TTS 兜底 ---------- */
function audioURL(idx) {
  return `audio/${cur.id}/${String(idx).padStart(2, '0')}.mp3`;
}

/* ===== 音频引擎：全局唯一 Audio 实例 =====
   单实例复用是防重叠的终极方案：物理上不可能有两个声音。
   切句 = 换 src；停止 = pause + currentTime=0 */
let speakToken = 0;
const PLAYER = new Audio();
PLAYER.preload = 'auto';

function hardStopAll() {
  speakToken++;
  try {
    PLAYER.onended = null; PLAYER.onerror = null; PLAYER.onplay = null; PLAYER.onloadedmetadata = null;
    PLAYER.pause();
    PLAYER.currentTime = 0;
  } catch (e) {}
  tts.audio = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/* 播放按钮防抖 */
let lastBtnClick = 0;

function speakFrom(idx) {
  if (idx >= cur.sentences.length) { finishTTS(); return; }
  bgmDuck(0.07);
  const myToken = ++speakToken;          // 本句独占 token
  try { PLAYER.pause(); } catch (e) {}   // 先停当前（单实例，立刻生效）

  if (audioReady) {
    tts.mode = 'audio';
    tts.audio = PLAYER;
    PLAYER.onloadedmetadata = () => { if (myToken === speakToken) progressUpdate(); };
    PLAYER.onplay = () => {
      if (myToken !== speakToken) { try { PLAYER.pause(); } catch (e) {} return; }
      highlight(idx);
    };
    PLAYER.onended = () => {
      if (myToken !== speakToken || !tts.playing) return;
      tts.idx = idx + 1;
      progressUpdate();
      speakFrom(tts.idx);
    };
    const skipAndNext = () => {
      if (myToken !== speakToken) return;
      try { PLAYER.pause(); } catch (e) {}
      highlight(idx);
      tts.idx = idx + 1;
      progressUpdate();
      if (tts.playing) setTimeout(() => speakFrom(tts.idx), 120);
    };
    PLAYER.onerror = skipAndNext;
    PLAYER.src = audioURL(idx);
    PLAYER.playbackRate = RATES[rateIdx];
    const pr = PLAYER.play();
    if (pr && pr.catch) pr.catch(skipAndNext);
    highlight(idx);
    return;
  }
  nativeSpeak(idx);
}
function nativeSpeak(idx) {
  tts.mode = 'native';
  if (!('speechSynthesis' in window)) {
    highlight(idx);
    tts.idx = idx + 1;
    if (tts.playing) setTimeout(() => speakFrom(tts.idx), 1200);
    return;
  }
  // speechSynthesis.cancel() 是异步的，立即 speak 可能与残留声音重叠
  speechSynthesis.cancel();
  const myToken = speakToken;
  setTimeout(() => {
    if (myToken !== speakToken) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(cur.sentences[idx].replace(/[（）]/g, ''));
    const voice = pickVoice(cur.tts.voice);
    if (voice) u.voice = voice;
    const isNarration = cur.sentences[idx].startsWith('（') || cur.sentences[idx].startsWith('——');
    u.lang = 'zh-CN'; u.rate = cur.tts.rate * RATES[rateIdx] * (isNarration ? 0.9 : 1);
    u.onstart = () => { if (myToken === speakToken) highlight(idx); };
    u.onend = () => {
      if (myToken !== speakToken || !tts.playing) return;
      tts.idx = idx + 1;
      progressUpdate();
      speakFrom(tts.idx);
    };
    speechSynthesis.speak(u);
  }, 80);
}
function pickVoice(gender) {
  const vs = speechSynthesis.getVoices().filter(v => /zh|cmn/i.test(v.lang));
  if (!vs.length) return null;
  const female = vs.find(v => /female|xiaoxiao|ting|huihui|yaoyao|tingting/i.test(v.name));
  const male = vs.find(v => /male|yunxi|kang|guyi/i.test(v.name));
  return gender === 'female' ? (female || vs[0]) : (male || vs[0]);
}
function highlight(idx) {
  document.querySelectorAll('.sent.active').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.sent[data-i="${idx}"]`);
  if (el) {
    el.classList.add('active');
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
function progressUpdate() {
  const total = cur.sentences.length;
  const pct = Math.min(100, (Math.max(0, tts.idx) / total) * 100);
  const fill = $('progress-fill'); if (fill) fill.style.width = pct + '%';
  const label = $('time-label');
  if (label) {
    if (tts.mode === 'audio' && tts.audio && tts.audio.duration && isFinite(tts.audio.duration)) {
      const curT = tts.audio.currentTime || 0;
      label.textContent = `${fmt(curT)} / ${fmt(tts.audio.duration)}`;
    } else {
      label.textContent = `${Math.max(0, tts.idx)}/${total} 句`;
    }
  }
}
function fmt(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function playTTS(fromIdx) {
  tts.playing = true; tts.paused = false;
  if (fromIdx != null) tts.idx = fromIdx;
  if (tts.idx < 0) tts.idx = 0;
  if (tts.idx >= cur.sentences.length) tts.idx = 0;
  speakFrom(tts.idx);
  updatePlayerUI();
}
function pauseTTS() {
  tts.playing = false;
  hardStopAll();
  updatePlayerUI();
}
function resumeTTS() {
  // 暂停后续播：audio 模式可续播当前句，native 只能重头读本句
  if (tts.idx < 0) { playTTS(0); return; }
  playTTS(Math.max(0, tts.idx));
}
function stopTTS() {
  tts.playing = false; tts.paused = false; tts.idx = -1;
  hardStopAll();
  bgmDuck(0.22);
}
function finishTTS() {
  tts.playing = false; tts.idx = cur.sentences.length;
  bgmDuck(0.22);
  progressUpdate();
  document.querySelectorAll('.sent.active').forEach(el => el.classList.remove('active'));
  updatePlayerUI();
}
function updatePlayerUI() {
  const btn = $('play-btn'); if (!btn) return;
  btn.textContent = tts.playing ? '⏸' : '▶';
  const rate = $('rate-btn');
  if (rate) rate.textContent = RATES[rateIdx].toFixed(2).replace(/\.?0+$/, '') + 'x';
  const badge = $('engine-badge');
  if (badge) badge.textContent = audioReady ? '🎙 预生成朗读' : '💬 浏览器朗读';
  progressUpdate();
}

/* 播放器事件（事件委托，兼容阅读页重渲染） */
document.addEventListener('click', (e) => {
  if (!cur || views.reader.classList.contains('hidden')) return;

  if (e.target.id === 'play-btn') {
    // 防抖：250ms 内重复点击只认一次，避免连点造成多实例重叠
    const now = Date.now();
    if (now - lastBtnClick < 250) return;
    lastBtnClick = now;
    if (tts.playing) pauseTTS();
    else if (tts.idx >= 0 && tts.audio && tts.audio.paused) resumeTTS();
    else playTTS();
  } else if (e.target.id === 'restart-btn') {
    const now = Date.now();
    if (now - lastBtnClick < 250) return;
    lastBtnClick = now;
    stopTTS(); playTTS(0);
  } else if (e.target.id === 'rate-btn') {
    rateIdx = (rateIdx + 1) % RATES.length;
    const at = tts.idx, was = tts.playing;
    updatePlayerUI();
    if (was && at >= 0) {
      if (tts.mode === 'audio' && tts.audio) tts.audio.playbackRate = RATES[rateIdx];
      else { stopTTS(); playTTS(at); }
    }
  } else if (e.target.closest('#progress')) {
    const bar = $('progress'); const r = bar.getBoundingClientRect();
    const target = Math.floor(((e.clientX - r.left) / r.width) * cur.sentences.length);
    stopTTS(); playTTS(Math.max(0, Math.min(cur.sentences.length - 1, target)));
  } else if (e.target.classList.contains('sent') && !e.target.classList.contains('anno-term')) {
    const i = +e.target.dataset.i;
    stopTTS(); playTTS(i);
  } else if (e.target.classList.contains('anno-term')) {
    showAnno(e.target, +e.target.dataset.anno);
  } else if (e.target.id === 'side-toggle-btn') {
    $('reader-side').classList.toggle('open');
    $('side-mask').classList.toggle('hidden');
    e.target.textContent = $('reader-side').classList.contains('open') ? '▼ 收起' : '▲ 背景与结局';
  }
});
$('side-mask').addEventListener('click', closeSide);
function closeSide() {
  const s = $('reader-side'); if (s) s.classList.remove('open');
  $('side-mask').classList.add('hidden');
}

/* ---------- 点词弹注 ---------- */
function showAnno(el, ai) {
  const a = cur.annotations[ai];
  $('anno-term').textContent = a.term;
  $('anno-text').textContent = a.text;
  $('anno-src').textContent = '出处：' + a.src;
  const pop = $('anno-pop');
  pop.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  const pw = Math.min(330, innerWidth - 24);
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(12, Math.min(left, innerWidth - pw - 12));
  pop.style.left = left + 'px';
  pop.style.top = (r.bottom + 10) + 'px';
  if (r.bottom + 10 + pop.offsetHeight > innerHeight - 12) {
    pop.style.top = Math.max(12, r.top - pop.offsetHeight - 10) + 'px';
  }
}
function hideAnno() { $('anno-pop').classList.add('hidden'); }
$('anno-close').addEventListener('click', hideAnno);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.anno-pop') && !e.target.closest('.anno-term')) hideAnno();
});

/* ---------- 回信墙 + 回声回信 ---------- */
const WALL_KEY = 'jiashu-wall-v1';
/* 预置示例留言（示例角标标注，随用户留言一并展示于墙末） */
const SEED_WALL = [
  {
    to: '赵一曼', sign: '一位大学生',
    text: '您给宁儿的信我读了三遍。今天的孩子都知道"未满三岁就离开母亲"的您。盛世如您所愿。',
    reply: '孩子，我听见了。若宁儿还在，也该是白发之人了。你们活在没有硝烟的年代，这便是我与宁儿分别时，心里许下的愿。'
  },
  {
    to: '左权', sign: '一位读者',
    text: '左权将军，您信里连写四个"念"字，我在屏幕前也跟着念了一遍。山河无恙，家书有声。',
    reply: '那四个"念"字，是我在油灯底下最重的笔墨。你们把"念"字过成了安生日子，便是最好的回信。'
  },
  {
    to: '江竹筠', sign: '一位青年',
    text: '江姐，云儿若还在，也该是幸福的老人了。我们替您看到了那一天。',
    reply: '同志们用血换来的春天，你们正站在花里。替我看看孩子们的课堂，替我听一听清晨的读书声。'
  },
  {
    to: '熊厚发', sign: '青海的一名学生',
    text: '熊厚发同志，祁连山的雪化了又下。我在青海上学，每次经过山口都会想起您。',
    reply: '小同志，祁连山记得每一个埋头赶路的人。我在山中无纸无笔，托风把话捎给你们——路是走出来的，好日子是熬出来的。'
  }
];
let REPLIES = null;   // replies.json
function getWall() { try { return JSON.parse(localStorage.getItem(WALL_KEY)) || []; } catch { return []; } }
function renderWall() {
  // 先烈下拉（仅首次）
  const sel = $('wall-to');
  if (sel.options.length <= 1) {
    LETTERS.forEach(l => {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = `${l.author}（NO.${l.id}）`;
      sel.appendChild(o);
    });
  }
  const items = getWall();
  const cardHTML = (w, i, seed) => `
    <div class="wall-card${seed ? ' seed' : ''}">
      ${seed ? '<div class="wc-seed">示例</div>' : `<button class="wc-del" data-i="${i}" title="删除">✕</button>`}
      <div class="wc-to">致 ${escapeHTML(w.to)} 的一封信${w.sign ? ` · ${escapeHTML(w.sign)}` : ''}</div>
      <div class="wc-text">${escapeHTML(w.text)}</div>
      ${w.reply ? `<div class="wc-echo"><span class="wc-echo-seal">回</span>${escapeHTML(w.reply)}</div>
        <div class="wc-echo-note">AI 模拟回声 · 非历史原件</div>` : ''}
    </div>`;
  const userHTML = items.map((w, i) => cardHTML(w, i, false)).join('');
  const seedHTML = SEED_WALL.map(w => cardHTML(w, -1, true)).join('');
  $('wall-grid').innerHTML = (userHTML + seedHTML) || '<div class="wall-empty">还没有回信，来写第一封吧</div>';
}
$('wall-text').addEventListener('input', e => {
  $('wall-count').textContent = `${e.target.value.length} / 200`;
});

/* 关键词匹配选择回声 */
function pickEcho(letterId, userText) {
  if (!REPLIES || !REPLIES.replies[letterId]) return null;
  const pack = REPLIES.replies[letterId];
  let best = null, bestScore = 0;
  for (const item of pack.items) {
    const score = item.keywords.reduce((n, k) => n + (userText.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return (best || { text: pack.fallback }).text;
}

$('wall-form').addEventListener('submit', e => {
  e.preventDefault();
  const toId = $('wall-to').value;
  const toName = (LETTERS.find(l => l.id === toId) || {}).author || $('wall-to').selectedOptions[0]?.textContent || '';
  const sign = $('wall-sign').value.trim();
  const text = $('wall-text').value.trim();
  const hint = $('wall-hint');
  const bad = ['法轮', '台独', '港独', '爆', '枪', '杀政'];
  if (!toId || bad.some(w => text.includes(w))) {
    hint.textContent = !toId ? '请先选择写给哪位先烈。' : '内容包含不适宜词汇，请修改后再寄出。';
    hint.classList.remove('hidden'); return;
  }
  hint.classList.add('hidden');

  const echo = pickEcho(toId, text);

  // 展示回声
  $('echo-from').textContent = `来自 ${toName} 的回信`;
  $('echo-text').textContent = echo || '（回声暂时沉默，请再试一次）';
  $('echo-box').classList.remove('hidden');
  $('echo-box').dataset.to = toName;
  $('echo-box').dataset.reply = echo || '';
  $('echo-box').dataset.letter = toId;
  $('echo-box').dataset.sign = sign;
  $('echo-box').dataset.orig = text;
  $('echo-box').scrollIntoView({ block: 'center', behavior: 'smooth' });

  $('wall-form').reset(); $('wall-count').textContent = '0 / 200';
});

/* 贴上墙（把回信一起存） */
function pushToWall() {
  const box = $('echo-box');
  if (!box.dataset.to) return;
  const items = getWall();
  items.unshift({
    to: box.dataset.to, text: box.dataset.orig, reply: box.dataset.reply,
    sign: box.dataset.sign, ts: Date.now(),
  });
  localStorage.setItem(WALL_KEY, JSON.stringify(items));
  delete box.dataset.to;
  $('echo-box').classList.add('hidden');
  renderWall();
}
$('echo-close').addEventListener('click', pushToWall);
$('echo-again').addEventListener('click', () => {
  // 不入库，重新写
  $('echo-box').classList.add('hidden');
  delete $('echo-box').dataset.to;
  $('wall-text').focus();
});

/* ---------- 回声保存为图片 ---------- */
function echoLines(ctx, text, maxW) {
  let lines = 1, w = 0;
  for (const ch of text) {
    const cw = ctx.measureText(ch).width;
    if (w + cw > maxW) { lines++; w = cw; } else w += cw;
  }
  return lines;
}
function echoWrap(ctx, text, x, y, maxW, lh) {
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      ctx.fillText(line, x, y); y += lh; line = ch;
    } else line += ch;
  }
  if (line) { ctx.fillText(line, x, y); y += lh; }
  return y;
}
function saveEchoImage() {
  const box = $('echo-box');
  const to = box.dataset.to || '先烈';
  const orig = box.dataset.orig || '';
  const reply = box.dataset.reply || '';
  const sign = box.dataset.sign || '一位读者';
  const SERIF = '"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC",serif';
  const UI = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';

  // 量高
  const m = document.createElement('canvas').getContext('2d');
  const W = 720, padX = 56, maxW = W - padX * 2;
  m.font = '17px ' + SERIF;
  const l1 = echoLines(m, orig, maxW), l2 = echoLines(m, reply, maxW);
  const H = 260 + l1 * 32 + l2 * 32 + 150;

  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);

  // 信笺底 + 内外框
  ctx.fillStyle = '#fffdf6'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(166,43,37,.05)'); g.addColorStop(1, 'rgba(176,141,79,.07)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#a62b25'; ctx.lineWidth = 3; ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.strokeStyle = 'rgba(176,141,79,.75)'; ctx.lineWidth = 1; ctx.strokeRect(28, 28, W - 56, H - 56);

  let y = 78;
  // 标题
  ctx.fillStyle = '#a62b25'; ctx.font = '700 26px ' + SERIF;
  ctx.fillText('家书 · 回声', padX, y);
  ctx.fillStyle = '#b08d4f'; ctx.font = '11px ' + UI;
  ctx.fillText('见字如面，听声如晤', padX + 160, y - 2);
  y += 16;
  ctx.strokeStyle = 'rgba(176,141,79,.6)'; ctx.beginPath();
  ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();

  // 用户的信
  y += 40;
  ctx.fillStyle = '#a62b25'; ctx.font = '15px ' + UI;
  ctx.fillText('致 ' + to + ' 的一封信', padX, y);
  y += 34;
  ctx.fillStyle = '#2b2724'; ctx.font = '17px ' + SERIF;
  y = echoWrap(ctx, orig, padX, y, maxW, 32);

  // 分隔
  y += 18;
  ctx.strokeStyle = 'rgba(166,43,37,.35)'; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
  ctx.setLineDash([]);

  // 回声
  y += 44;
  ctx.fillStyle = '#a62b25'; ctx.font = '15px ' + UI;
  ctx.fillText('来自 ' + to + ' 的回声', padX, y);
  ctx.fillStyle = '#b08d4f'; ctx.font = '11px ' + UI;
  ctx.fillText('AI 模拟回声 · 非历史原件', padX + 170, y);
  y += 34;
  ctx.fillStyle = '#4a443b'; ctx.font = '17px ' + SERIF;
  y = echoWrap(ctx, reply, padX, y, maxW, 32);

  // 落款
  y += 26;
  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = '#544d43'; ctx.font = '14px ' + UI;
  ctx.fillText(sign + '　·　' + dateStr, padX, y);

  // 印章
  const sx = W - padX - 62, sy = y - 52;
  ctx.save();
  ctx.translate(sx + 31, sy + 31); ctx.rotate(-6 * Math.PI / 180);
  ctx.fillStyle = '#a62b25'; ctx.fillRect(-31, -31, 62, 62);
  ctx.strokeStyle = '#fffdf6'; ctx.lineWidth = 2; ctx.strokeRect(-25, -25, 50, 50);
  ctx.fillStyle = '#fffdf6'; ctx.font = '700 30px ' + SERIF;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('回', 0, 2);
  ctx.restore();

  // 底注
  ctx.fillStyle = '#8a8378'; ctx.font = '10.5px ' + UI; ctx.textAlign = 'left';
  ctx.fillText('本图片由《家书·回声》数字展馆生成 · 回声依据先烈生平与文风创作，不代表先烈真实言论', padX, H - 52);

  c.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = '家书回声-致' + to + '-回信.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
$('echo-save').addEventListener('click', saveEchoImage);
$('wall-grid').addEventListener('click', e => {
  if (e.target.classList.contains('wc-del')) {
    const items = getWall(); items.splice(+e.target.dataset.i, 1);
    localStorage.setItem(WALL_KEY, JSON.stringify(items));
    renderWall();
  }
});

/* ---------- 时间轴（1921—1949 家书年表 + 时代事件线） ---------- */
const EVENTS = [
  { year: 1921, text: '中国共产党成立' },
  { year: 1924, text: '第一次国共合作 · 黄埔军校创建' },
  { year: 1927, text: '四一二政变 · 南昌起义 · 秋收起义 · 广州起义' },
  { year: 1928, text: '井冈山会师' },
  { year: 1934, text: '中央红军开始长征' },
  { year: 1935, text: '遵义会议' },
  { year: 1936, text: '红军三大主力会师 · 西安事变' },
  { year: 1937, text: '全民族抗战爆发' },
  { year: 1940, text: '百团大战' },
  { year: 1942, text: '太行根据地反"扫荡"' },
  { year: 1945, text: '抗日战争胜利' },
  { year: 1949, text: '中华人民共和国成立' },
];
function renderTimeline() {
  let read = [];
  try { read = JSON.parse(localStorage.getItem('jiashu-read') || '[]'); } catch (e) {}
  const list = [...LETTERS].sort((a, b) => a.year - b.year);
  const out = [];
  const pending = EVENTS.slice();
  const eventHTML = ev => `
    <div class="tl-item event">
      <div class="tl-year">${ev.year}</div>
      <div class="tl-dot"></div>
      <div class="tl-event"><b>${ev.year}</b>${ev.text}</div>
    </div>`;
  list.forEach(l => {
    while (pending.length && pending[0].year <= l.year) out.push(eventHTML(pending.shift()));
    out.push(`
    <div class="tl-item">
      <div class="tl-year">${l.year}</div>
      <div class="tl-dot${read.includes(l.id) ? ' read' : ''}"></div>
      <div class="tl-card${read.includes(l.id) ? ' read' : ''}" data-id="${l.id}">
        <div class="tl-head"><b>${l.author}</b><span class="tl-prov">${l.province || ''}</span></div>
        <div class="tl-title">《${l.title}》</div>
        <div class="tl-date">${l.date}</div>
        <p class="tl-excerpt">“${l.excerpt}”</p>
        <span class="tl-link">展读此信 →</span>
      </div>
    </div>`);
  });
  while (pending.length) out.push(eventHTML(pending.shift()));
  $('timeline').innerHTML = out.join('');
}
$('timeline').addEventListener('click', e => {
  const c = e.target.closest('.tl-card');
  if (c) location.hash = `#/letter/${c.dataset.id}`;
});

/* ---------- 尾声 ---------- */
function renderEpilogue() {
  $('epilogue-list').innerHTML = LETTERS.map(l =>
    `<a href="#/letter/${l.id}">NO.${l.id} ${l.author}</a>`).join('');
  $('epilogue-qinghai').textContent = '青海回声：从祁连山中熊厚发的“党员介绍信”，到循化红光清真寺屋脊上刻着五角星的青砖——青海的土地记得。';

  // 我的参观足迹
  let read = [];
  try { read = JSON.parse(localStorage.getItem('jiashu-read') || '[]'); } catch (e) {}
  const wallN = getWall().length;
  const readNames = read.map(id => (LETTERS.find(x => x.id === id) || {}).author).filter(Boolean);
  $('visit-box').innerHTML = `
    <div class="visit-title">☆ 我的参观足迹</div>
    <div class="visit-stats">
      你读了 <b>${read.length}</b> / ${LETTERS.length} 封信${readNames.length ? '（' + readNames.join('、') + '）' : ''}<br>
      在回信墙写下 <b>${wallN}</b> 封回信
    </div>
    <button class="btn-primary btn-small visit-btn" id="visit-save">生 成 参 观 纪 念 卡</button>`;
  const vs = $('visit-save');
  if (vs) vs.addEventListener('click', saveVisitCard);
}

/* ---------- 参观纪念卡（canvas 生成） ---------- */
function saveVisitCard() {
  let read = [];
  try { read = JSON.parse(localStorage.getItem('jiashu-read') || '[]'); } catch (e) {}
  const wallN = getWall().length;
  const rows = read.map(id => {
    const l = LETTERS.find(x => x.id === id);
    return l ? `NO.${l.id}　${l.author}　《${l.title}》` : '';
  }).filter(Boolean);
  const SERIF = '"Songti SC","STSong","Source Han Serif SC","Noto Serif CJK SC",serif';
  const UI = '"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
  const W = 720, H = 980;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);

  // 深红底 + 金框
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#5c130f'); bg.addColorStop(.55, '#7a1a16'); bg.addColorStop(1, '#4a0f0c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(212,175,105,.8)'; ctx.lineWidth = 2; ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.strokeStyle = 'rgba(212,175,105,.35)'; ctx.lineWidth = 1; ctx.strokeRect(38, 38, W - 76, H - 76);

  // 标题
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e7c98d'; ctx.font = '700 34px ' + SERIF;
  ctx.fillText('家书 · 回声', W / 2, 118);
  ctx.fillStyle = 'rgba(231,201,142,.75)'; ctx.font = '13px ' + UI;
  ctx.fillText('参 观 纪 念 卡', W / 2, 150);

  // 金句
  ctx.fillStyle = '#f7ead2'; ctx.font = '21px ' + SERIF;
  ctx.fillText('传承，是记住之后，', W / 2, 232);
  ctx.fillText('再说给下一个人听。', W / 2, 268);

  // 分隔
  ctx.strokeStyle = 'rgba(212,175,105,.5)';
  ctx.beginPath(); ctx.moveTo(140, 312); ctx.lineTo(W - 140, 312); ctx.stroke();

  // 统计
  ctx.fillStyle = '#ffd9a2'; ctx.font = '700 30px ' + SERIF;
  ctx.fillText(`读 了 ${read.length} / ${LETTERS.length} 封 信`, W / 2, 388);
  ctx.font = '16px ' + UI; ctx.fillStyle = 'rgba(247,234,210,.85)';
  ctx.fillText(`写下 ${wallN} 封回信 · 1921 — 1949`, W / 2, 428);

  // 读过的信
  let y = 492;
  if (rows.length) {
    ctx.fillStyle = 'rgba(231,201,142,.9)'; ctx.font = '13px ' + UI;
    ctx.fillText('— 你听过的家书 —', W / 2, y); y += 40;
    ctx.font = '15px ' + SERIF; ctx.fillStyle = '#f0d9a8';
    rows.slice(0, 12).forEach(r => { ctx.fillText(r, W / 2, y); y += 32; });
  } else {
    ctx.fillStyle = 'rgba(240,217,168,.8)'; ctx.font = '15px ' + SERIF;
    ctx.fillText('还没有展读记录——去听一封家书吧。', W / 2, y + 30);
  }

  // 印章
  const sx = W / 2 - 36, sy = H - 176;
  ctx.save();
  ctx.translate(sx + 36, sy + 36); ctx.rotate(-6 * Math.PI / 180);
  ctx.fillStyle = '#c2352c'; ctx.fillRect(-36, -36, 72, 72);
  ctx.strokeStyle = '#f7ead2'; ctx.lineWidth = 2.5; ctx.strokeRect(-29, -29, 58, 58);
  ctx.fillStyle = '#f7ead2'; ctx.font = '700 34px ' + SERIF;
  ctx.fillText('聽', 0, 4);
  ctx.restore();

  // 日期与底注
  const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillStyle = 'rgba(247,234,210,.72)'; ctx.font = '13px ' + UI;
  ctx.fillText(dateStr + ' · 展于《家书·回声》数字展馆', W / 2, H - 66);
  ctx.fillStyle = 'rgba(231,201,142,.5)'; ctx.font = '10.5px ' + UI;
  ctx.fillText('CMIT「红色之旅 追梦铸魂」专项赛道参赛作品', W / 2, H - 42);

  c.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = '家书回声-参观纪念卡.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

/* ---------- 纪念日唤醒（临近先烈纪念日时在序厅提示） ---------- */
const ANNIS = [
  { m: 1, d: 12, id: '07', year: 1937, label: '董振堂高台殉难' },
  { m: 3, d: 16, id: '08', year: 1935, label: '刘伯坚狱中写下遗书' },
  { m: 3, d: 20, id: '03', year: 1928, label: '夏明翰就义' },
  { m: 3, d: 21, id: '08', year: 1935, label: '刘伯坚就义' },
  { m: 3, d: 24, id: '06', year: 1929, label: '赵云霄写下遗书' },
  { m: 3, d: 26, id: '06', year: 1929, label: '赵云霄就义' },
  { m: 5, d: 25, id: '11', year: 1942, label: '左权十字岭牺牲' },
  { m: 8, d: 2, id: '09', year: 1936, label: '赵一曼就义' },
  { m: 8, d: 7, id: '02', year: 1930, label: '陈毅安长沙牺牲' },
  { m: 9, d: 27, id: '04', year: 1928, label: '史砚芬雨花台就义' },
  { m: 10, d: 10, id: '05', year: 1928, label: '陈觉写下绝笔' },
  { m: 10, d: 14, id: '05', year: 1928, label: '陈觉就义' },
  { m: 11, d: 14, id: '12', year: 1949, label: '江竹筠就义' },
  { m: 12, d: 12, id: '01', year: 1927, label: '张太雷牺牲' },
];
function renderAnniversary() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  ANNIS.forEach(a => {
    const diff = Math.round((new Date(now.getFullYear(), a.m - 1, a.d) - today) / 86400000);
    if (Math.abs(diff) <= 2 && (!best || Math.abs(diff) <= Math.abs(best.diff))) best = Object.assign({}, a, { diff });
  });
  if (!best) return;
  const years = now.getFullYear() - best.year;
  const when = best.diff === 0 ? '今天' : best.diff === 1 ? '明天' : best.diff === -1 ? '昨天' : (best.diff < 0 ? (-best.diff) + ' 天前' : best.diff + ' 天后');
  const bar = document.createElement('div');
  bar.className = 'anniv-bar';
  bar.innerHTML = `<span class="anniv-dot"></span>${when} · ${best.year} 年 ${best.m} 月 ${best.d} 日 ${best.label} · ${years} 周年<span class="anniv-go">去看看这封信 →</span>`;
  bar.addEventListener('click', () => { location.hash = `#/letter/${best.id}`; });
  const content = document.querySelector('.landing-content');
  if (content) content.insertBefore(bar, content.firstChild);
}

/* ---------- 关于 ---------- */
function renderAbout() {
  fetch('data/letters.json').then(r => r.json()).then(d => {
    $('about-sources').innerHTML = d.sources.map(s => `<li>${s}</li>`).join('');
  });
}

/* ---------- 工具 ---------- */
function escapeHTML(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* 顶栏菜单 */
$('menu-btn').addEventListener('click', () => $('mobile-nav').classList.toggle('hidden'));

/* ---------- 启动 ---------- */
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
load().then(() => { route(); renderAnniversary(); });

})();
