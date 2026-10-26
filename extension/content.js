/**
 * PageMemo - 内容脚本
 * 在任意网页右下角提供「记一笔」按钮与 Shadow DOM 侧边抽屉
 */

(function () {
  'use strict';

  // 避免同一页面重复注入
  if (window.__pageMemoInjected) return;
  window.__pageMemoInjected = true;

  const COLORS = {
    yellow: '#FFD966',
    pink: '#F4A7B9',
    blue: '#9DC3E6',
    green: '#A8D5A2',
  };

  /** 归一化 URL：去掉 hash 与查询参数，作为页面维度主键 */
  function normalizeUrl(rawUrl) {
    try {
      const u = new URL(rawUrl);
      const pathname = u.pathname || '/';
      return `${u.protocol}//${u.host}${pathname}`;
    } catch {
      return rawUrl || '';
    }
  }

  /** 从当前页面提取 host（小写 hostname） */
  function getHost(rawUrl) {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return location.hostname.toLowerCase();
    }
  }

  // ---------- storage 集中读写（读全量 → 改内存 → 写回）----------

  async function getMemos() {
    const result = await chrome.storage.local.get({ memos: [] });
    return Array.isArray(result.memos) ? result.memos.slice() : [];
  }

  async function saveMemos(list) {
    await chrome.storage.local.set({ memos: list });
  }

  async function addMemo(text, color) {
    const memos = await getMemos();
    const pageUrl = normalizeUrl(location.href);
    const memo = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      text: text.trim(),
      color,
      done: false,
      createdAt: Date.now(),
      url: pageUrl,
      host: getHost(location.href),
      pageTitle: document.title || pageUrl,
    };
    memos.push(memo);
    await saveMemos(memos);
    notifyBadge();
    return memo;
  }

  async function toggleDone(id) {
    const memos = await getMemos();
    const item = memos.find((m) => m.id === id);
    if (!item) return;
    item.done = !item.done;
    await saveMemos(memos);
    notifyBadge();
  }

  async function deleteMemo(id) {
    const memos = await getMemos();
    const next = memos.filter((m) => m.id !== id);
    await saveMemos(next);
    notifyBadge();
  }

  /** 通知 background 更新当前标签页徽章数量 */
  function notifyBadge() {
    try {
      chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        url: normalizeUrl(location.href),
      });
    } catch {
      // 扩展上下文失效时忽略
    }
  }

  // ---------- UI：Shadow DOM ----------

  const hostEl = document.createElement('div');
  hostEl.id = 'page-memo-root';
  // 不参与页面布局流，避免影响站点排版
  hostEl.style.cssText = 'all:initial;position:fixed;z-index:2147483646;';
  document.documentElement.appendChild(hostEl);

  const shadow = hostEl.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host, * { box-sizing: border-box; }
    .fab {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2;
      padding: 12px 18px;
      border: none;
      border-radius: 24px;
      background: #FFD966;
      color: #3d3200;
      font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
      transition: transform .15s ease, box-shadow .15s ease, filter .15s ease;
    }
    .fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(0,0,0,.22);
      filter: brightness(1.03);
    }
    .fab:active { transform: translateY(0); }
    .fab.open {
      background: #f0c84a;
    }

    .overlay {
      position: fixed;
      inset: 0;
      z-index: 1;
      background: rgba(40, 36, 20, 0.18);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
    }
    .overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer {
      position: fixed;
      top: 0;
      right: 0;
      z-index: 2;
      width: 320px;
      max-width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background:
        linear-gradient(180deg, #FFFBF0 0%, #FFF8E7 48%, #FFF3D6 100%);
      box-shadow: -6px 0 28px rgba(0,0,0,.14);
      border-radius: 16px 0 0 16px;
      transform: translateX(105%);
      transition: transform .22s ease;
      font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #3a3420;
    }
    .drawer.open { transform: translateX(0); }

    .header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid rgba(0,0,0,.06);
      flex-shrink: 0;
    }
    .page-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #2c2718;
    }
    .page-host {
      margin-top: 4px;
      font-size: 12px;
      color: #8a7e5c;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .composer {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(0,0,0,.06);
      flex-shrink: 0;
    }
    .composer textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
      border: 1px solid rgba(0,0,0,.1);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
      color: inherit;
      background: rgba(255,255,255,.85);
      outline: none;
    }
    .composer textarea:focus {
      border-color: #E6A800;
      box-shadow: 0 0 0 2px rgba(255,217,102,.45);
    }
    .composer-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .colors {
      display: flex;
      gap: 6px;
      flex: 1;
    }
    .color-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.08);
    }
    .color-dot.selected {
      border-color: #5a4e2a;
      box-shadow: 0 0 0 2px rgba(90,78,42,.15);
    }
    .btn-save {
      border: none;
      border-radius: 10px;
      padding: 8px 14px;
      background: #FFD966;
      color: #3d3200;
      font: 600 13px system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.1);
    }
    .btn-save:hover { filter: brightness(1.04); }
    .btn-save:disabled {
      opacity: .5;
      cursor: not-allowed;
      filter: none;
    }

    .list {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px 20px;
    }
    .empty {
      text-align: center;
      color: #9a8e6c;
      padding: 36px 12px;
      font-size: 13px;
    }
    .memo {
      display: grid;
      grid-template-columns: 6px 1fr auto;
      gap: 10px;
      align-items: start;
      background: rgba(255,255,255,.72);
      border-radius: 12px;
      padding: 10px 10px 10px 0;
      margin-bottom: 10px;
      box-shadow: 0 1px 4px rgba(0,0,0,.06);
      border: 1px solid rgba(0,0,0,.04);
    }
    .memo.done .memo-text {
      text-decoration: line-through;
      color: #9a9178;
    }
    .color-bar {
      width: 6px;
      align-self: stretch;
      border-radius: 12px 0 0 12px;
    }
    .memo-body { min-width: 0; }
    .memo-text {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      margin: 0 0 6px;
    }
    .memo-meta {
      font-size: 11px;
      color: #9a8e6c;
    }
    .memo-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      padding-top: 2px;
    }
    .memo-actions input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: #E6A800;
    }
    .btn-del {
      border: none;
      background: transparent;
      color: #b07070;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 6px;
    }
    .btn-del:hover { background: rgba(176,112,112,.12); }
  `;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', '网页便签');

  drawer.innerHTML = `
    <div class="header">
      <h2 class="page-title"></h2>
      <div class="page-host"></div>
    </div>
    <div class="composer">
      <textarea class="memo-input" placeholder="记下一笔想法…" rows="3"></textarea>
      <div class="composer-row">
        <div class="colors" role="group" aria-label="颜色标签"></div>
        <button type="button" class="btn-save">保存</button>
      </div>
    </div>
    <div class="list"></div>
  `;

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab';
  fab.textContent = '记一笔';
  fab.setAttribute('aria-expanded', 'false');

  shadow.appendChild(style);
  shadow.appendChild(overlay);
  shadow.appendChild(drawer);
  shadow.appendChild(fab);

  const titleEl = drawer.querySelector('.page-title');
  const hostLabelEl = drawer.querySelector('.page-host');
  const listEl = drawer.querySelector('.list');
  const textarea = drawer.querySelector('.memo-input');
  const colorsEl = drawer.querySelector('.colors');
  const saveBtn = drawer.querySelector('.btn-save');

  let selectedColor = 'yellow';
  let isOpen = false;

  // 颜色点
  Object.keys(COLORS).forEach((key) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-dot' + (key === selectedColor ? ' selected' : '');
    btn.style.background = COLORS[key];
    btn.title = key;
    btn.dataset.color = key;
    btn.addEventListener('click', () => {
      selectedColor = key;
      colorsEl.querySelectorAll('.color-dot').forEach((el) => {
        el.classList.toggle('selected', el.dataset.color === key);
      });
    });
    colorsEl.appendChild(btn);
  });

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  }

  function setOpen(open) {
    isOpen = open;
    drawer.classList.toggle('open', open);
    overlay.classList.toggle('visible', open);
    fab.classList.toggle('open', open);
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      titleEl.textContent = document.title || '未命名页面';
      hostLabelEl.textContent = getHost(location.href);
      renderList();
      // 不修改 body overflow，保证页面仍可滚动
      setTimeout(() => textarea.focus(), 220);
    }
  }

  async function renderList() {
    const pageUrl = normalizeUrl(location.href);
    const memos = await getMemos();
    const pageMemos = memos
      .filter((m) => m.url === pageUrl)
      .sort((a, b) => b.createdAt - a.createdAt);

    listEl.innerHTML = '';

    if (pageMemos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '这个页面还没有便签';
      listEl.appendChild(empty);
      return;
    }

    pageMemos.forEach((memo) => {
      const row = document.createElement('div');
      row.className = 'memo' + (memo.done ? ' done' : '');

      const bar = document.createElement('div');
      bar.className = 'color-bar';
      bar.style.background = COLORS[memo.color] || COLORS.yellow;

      const body = document.createElement('div');
      body.className = 'memo-body';
      const text = document.createElement('p');
      text.className = 'memo-text';
      text.textContent = memo.text;
      const meta = document.createElement('div');
      meta.className = 'memo-meta';
      meta.textContent = formatTime(memo.createdAt);
      body.appendChild(text);
      body.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'memo-actions';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!memo.done;
      check.title = '标记完成';
      check.addEventListener('change', async () => {
        await toggleDone(memo.id);
        renderList();
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-del';
      del.textContent = '删除';
      del.addEventListener('click', async () => {
        await deleteMemo(memo.id);
        renderList();
      });

      actions.appendChild(check);
      actions.appendChild(del);

      row.appendChild(bar);
      row.appendChild(body);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  async function handleSave() {
    const text = textarea.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    try {
      await addMemo(text, selectedColor);
      textarea.value = '';
      await renderList();
    } finally {
      saveBtn.disabled = false;
      textarea.focus();
    }
  }

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen);
  });

  overlay.addEventListener('click', () => setOpen(false));

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSave();
  });

  // 阻止输入事件冒泡，避免被站点快捷键拦截
  function stopBubble(e) {
    e.stopPropagation();
  }
  ['keydown', 'keyup', 'keypress', 'input'].forEach((type) => {
    textarea.addEventListener(type, stopBubble);
  });

  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  });

  // 其他标签页或管理页修改 storage 时同步列表
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.memos && isOpen) {
      renderList();
    }
  });

  // 首次注入后同步一次徽章
  notifyBadge();
})();
