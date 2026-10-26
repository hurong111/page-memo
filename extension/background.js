/**
 * PageMemo - 后台脚本
 * 负责：工具栏打开管理页、更新当前标签页便签数量徽章
 */

/** 归一化 URL：去掉 hash 与查询参数 */
function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const pathname = u.pathname || '/';
    return `${u.protocol}//${u.host}${pathname}`;
  } catch {
    return rawUrl || '';
  }
}

/** 从 storage 读取全部便签 */
async function getMemos() {
  const result = await chrome.storage.local.get({ memos: [] });
  return Array.isArray(result.memos) ? result.memos.slice() : [];
}

/** 更新指定标签页的徽章数量 */
async function updateBadgeForTab(tabId, tabUrl) {
  if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('edge://')) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const normalized = normalizeUrl(tabUrl);
  const memos = await getMemos();
  const count = memos.filter((m) => m.url === normalized).length;
  const text = count > 0 ? String(count) : '';
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#E6A800' });
}

/** 点击工具栏图标 → 打开全部便签管理页 */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('memos.html') });
});

/** 内容脚本通知：保存/删除后刷新徽章 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'UPDATE_BADGE') {
    const tabId = sender.tab && sender.tab.id;
    const tabUrl = (message.url) || (sender.tab && sender.tab.url);
    if (tabId != null) {
      updateBadgeForTab(tabId, tabUrl).then(() => sendResponse({ ok: true }));
      return true;
    }
    sendResponse({ ok: false });
  }
  return false;
});

/** 切换标签或导航完成后刷新徽章 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updateBadgeForTab(tab.id, tab.url);
  } catch {
    // 忽略无法访问的标签页
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

/** storage 变更时，刷新当前活动标签徽章 */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.memos) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) {
      await updateBadgeForTab(tab.id, tab.url);
    }
  } catch {
    // 忽略
  }
});
