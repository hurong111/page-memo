/**
 * PageMemo - 全部便签管理页
 * 按 host 分组；搜索 / 筛选 / 行内编辑 / 导出 / 实时同步
 */

(function () {
  'use strict';

  const COLORS = {
    yellow: '#FFD966',
    pink: '#F4A7B9',
    blue: '#9DC3E6',
    green: '#A8D5A2',
  };

  // ---------- storage 集中读写 ----------

  async function getMemos() {
    const result = await chrome.storage.local.get({ memos: [] });
    return Array.isArray(result.memos) ? result.memos.slice() : [];
  }

  async function saveMemos(list) {
    await chrome.storage.local.set({ memos: list });
  }

  async function updateMemo(id, patch) {
    const memos = await getMemos();
    const item = memos.find((m) => m.id === id);
    if (!item) return;
    Object.assign(item, patch);
    await saveMemos(memos);
  }

  async function deleteMemo(id) {
    const memos = await getMemos();
    await saveMemos(memos.filter((m) => m.id !== id));
  }

  async function clearDone() {
    const memos = await getMemos();
    await saveMemos(memos.filter((m) => !m.done));
  }

  // ---------- DOM ----------

  const groupsEl = document.getElementById('groups');
  const emptyEl = document.getElementById('empty');
  const searchEl = document.getElementById('search');
  const filterEl = document.getElementById('filter');

  let allMemos = [];

  function formatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** 按当前搜索与筛选得到可见列表 */
  function getVisibleMemos() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const filter = filterEl.value;

    return allMemos.filter((m) => {
      if (filter === 'todo' && m.done) return false;
      if (filter === 'done' && !m.done) return false;
      if (!q) return true;
      const hay = `${m.text || ''} ${m.pageTitle || ''} ${m.host || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  /** 按 host 分组，组内按创建时间倒序 */
  function groupByHost(list) {
    const map = new Map();
    list.forEach((m) => {
      const host = m.host || '未知站点';
      if (!map.has(host)) map.set(host, []);
      map.get(host).push(m);
    });
    const groups = Array.from(map.entries()).map(([host, items]) => ({
      host,
      items: items.slice().sort((a, b) => b.createdAt - a.createdAt),
    }));
    // 站点按组内最新便签时间倒序
    groups.sort((a, b) => (b.items[0]?.createdAt || 0) - (a.items[0]?.createdAt || 0));
    return groups;
  }

  function render() {
    const visible = getVisibleMemos();
    groupsEl.innerHTML = '';

    if (allMemos.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    if (visible.length === 0) {
      const tip = document.createElement('div');
      tip.className = 'no-result';
      tip.textContent = '没有符合条件的便签';
      groupsEl.appendChild(tip);
      return;
    }

    const groups = groupByHost(visible);
    groups.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'group';

      const header = document.createElement('div');
      header.className = 'group-header';
      header.innerHTML = `
        <h2 class="group-host"></h2>
        <span class="group-count"></span>
      `;
      header.querySelector('.group-host').textContent = group.host;
      header.querySelector('.group-count').textContent = `${group.items.length} 条`;

      const ul = document.createElement('ul');
      ul.className = 'memo-list';

      group.items.forEach((memo) => {
        ul.appendChild(createMemoItem(memo));
      });

      section.appendChild(header);
      section.appendChild(ul);
      groupsEl.appendChild(section);
    });
  }

  function createMemoItem(memo) {
    const li = document.createElement('li');
    li.className = 'memo-item' + (memo.done ? ' done' : '');
    li.dataset.id = memo.id;

    const bar = document.createElement('div');
    bar.className = 'color-bar';
    bar.style.background = COLORS[memo.color] || COLORS.yellow;

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'memo-check';
    check.checked = !!memo.done;
    check.title = '标记完成';
    check.addEventListener('change', async () => {
      await updateMemo(memo.id, { done: check.checked });
      // onChanged 会触发刷新；此处不强制重绘以免打断编辑
    });

    const main = document.createElement('div');
    main.className = 'memo-main';

    const text = document.createElement('div');
    text.className = 'memo-text';
    text.textContent = memo.text;
    text.contentEditable = 'false';
    text.spellcheck = false;

    const meta = document.createElement('div');
    meta.className = 'memo-meta';

    const time = document.createElement('span');
    time.textContent = formatTime(memo.createdAt);

    const link = document.createElement('a');
    link.className = 'memo-link';
    link.href = memo.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const titlePart = memo.pageTitle ? memo.pageTitle : memo.url;
    link.textContent = `${memo.host || ''} · ${titlePart}`;
    link.title = memo.url;

    meta.appendChild(time);
    meta.appendChild(link);

    main.appendChild(text);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'memo-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-sm';
    editBtn.textContent = '编辑';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-sm danger';
    delBtn.textContent = '删除';

    let editing = false;

    editBtn.addEventListener('click', async () => {
      if (!editing) {
        editing = true;
        text.contentEditable = 'true';
        text.focus();
        // 选中全文方便修改
        const range = document.createRange();
        range.selectNodeContents(text);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editBtn.textContent = '保存';
        return;
      }
      const next = text.textContent.trim();
      if (!next) {
        text.textContent = memo.text;
      } else if (next !== memo.text) {
        await updateMemo(memo.id, { text: next });
      }
      editing = false;
      text.contentEditable = 'false';
      editBtn.textContent = '编辑';
    });

    text.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        editBtn.click();
      }
      if (e.key === 'Escape') {
        text.textContent = memo.text;
        editing = false;
        text.contentEditable = 'false';
        editBtn.textContent = '编辑';
      }
    });

    delBtn.addEventListener('click', async () => {
      if (confirm('确定删除这条便签？')) {
        await deleteMemo(memo.id);
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(bar);
    li.appendChild(check);
    li.appendChild(main);
    li.appendChild(actions);
    return li;
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(allMemos, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(`pagememo-${stamp}.json`, blob);
  }

  function exportTxt() {
    const stamp = new Date().toISOString().slice(0, 10);
    const lines = [];
    const groups = groupByHost(allMemos);
    groups.forEach((g) => {
      lines.push(`# ${g.host}`);
      g.items.forEach((m) => {
        const status = m.done ? '[x]' : '[ ]';
        lines.push(`${status} ${formatTime(m.createdAt)} | ${m.pageTitle || ''}`);
        lines.push(`    ${m.url}`);
        lines.push(`    ${m.text.replace(/\n/g, '\n    ')}`);
        lines.push('');
      });
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    downloadBlob(`pagememo-${stamp}.txt`, blob);
  }

  async function refreshFromStorage() {
    allMemos = await getMemos();
    render();
  }

  // 事件绑定
  searchEl.addEventListener('input', () => render());
  filterEl.addEventListener('change', () => render());
  document.getElementById('export-json').addEventListener('click', exportJson);
  document.getElementById('export-txt').addEventListener('click', exportTxt);
  document.getElementById('clear-done').addEventListener('click', async () => {
    const doneCount = allMemos.filter((m) => m.done).length;
    if (doneCount === 0) {
      alert('没有已完成的便签');
      return;
    }
    if (confirm(`确定清除 ${doneCount} 条已完成便签？`)) {
      await clearDone();
    }
  });

  // 任意处修改 storage 立即刷新
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.memos) {
      const next = changes.memos.newValue;
      allMemos = Array.isArray(next) ? next.slice() : [];
      render();
    }
  });

  refreshFromStorage();
})();
