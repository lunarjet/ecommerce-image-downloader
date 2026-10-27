/**
 * 电商图片下载器 - Popup 逻辑
 * 从 chrome.storage.local 读取图片 → 渲染网格 → 单张下载 / ZIP 打包
 */
(function () {
  'use strict';

  const gridEl = document.getElementById('grid');
  const imgCountEl = document.getElementById('imgCount');
  const productNameEl = document.getElementById('productName');
  const subtitleEl = document.getElementById('subtitle');
  const refreshBtn = document.getElementById('refreshBtn');
  const zipBtn = document.getElementById('zipBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const onlyLargeCb = document.getElementById('onlyLarge');
  const loadingEl = document.getElementById('loading');
  const loadingTextEl = document.getElementById('loadingText');

  // 当前页面抓取到的所有图片 URL
  let allImages = [];
  // 是否仅抓大图
  let onlyLarge = false;

  /** 商品名清洗为合法文件名 */
  function sanitizeName(name) {
    return (name || 'product').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 50) || 'product';
  }

  /** 从 URL 推测图片扩展名 */
  function guessExt(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      if (path.endsWith('.png')) return '.png';
      if (path.endsWith('.webp')) return '.webp';
      if (path.endsWith('.gif')) return '.gif';
      if (path.endsWith('.bmp')) return '.bmp';
      return '.jpg';
    } catch (e) {
      return '.jpg';
    }
  }

  /** 显示 toast 提示 */
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  /** 显示/隐藏 loading */
  function setLoading(show, text) {
    if (text) loadingTextEl.textContent = text;
    loadingEl.classList.toggle('hidden', !show);
  }

  /** 渲染图片网格 */
  function renderGrid(images) {
    gridEl.innerHTML = '';

    if (!images || images.length === 0) {
      gridEl.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🖼️</div>
          <div class="empty-text">暂无图片<br/>请在电商详情页打开本插件</div>
        </div>`;
      return;
    }

    images.forEach((url, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <img src="${url}" loading="lazy" referrerpolicy="no-referrer" alt="图片 ${idx + 1}" />
        <div class="overlay">
          <span class="size-tag">${idx + 1}</span>
          <button class="dl-btn">⬇ 下载</button>
        </div>`;

      // 点击卡片 = 下载
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadSingle(url);
      });

      // 右键下载
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        downloadSingle(url);
      });

      gridEl.appendChild(card);
    });
  }

  /** 单张下载 */
  function downloadSingle(url, suggestedName) {
    const product = sanitizeName(productNameEl.textContent || 'product');
    const ext = guessExt(url);
    const filename = suggestedName || `${product}_img${Date.now().toString().slice(-4)}${ext}`;
    chrome.downloads.download({ url, filename, saveAs: true });
  }

  /** 从当前活跃 tab 触发手动刷新 */
  function triggerRefresh() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'RESCan' }, (resp) => {
        if (chrome.runtime.lastError) {
          // 非电商页面 content script 未注入
          showToast('当前页面非支持的电商详情页');
        } else {
          showToast(`刷新完成，共 ${resp && resp.count ? resp.count : 0} 张`);
          loadFromStorage();
        }
      });
    });
  }

  /** 从 storage 读取数据并刷新 UI */
  function loadFromStorage() {
    chrome.storage.local.get(['images', 'productName', 'url'], (data) => {
      allImages = data.images || [];
      const name = data.productName || '—';
      const url = data.url || '';

      productNameEl.textContent = sanitizeName(name);
      subtitleEl.textContent = url ? (url.length > 36 ? url.slice(0, 36) + '…' : url) : '未检测到电商页面';

      // 应用"仅大图"过滤时暂不做尺寸检测（content.js 不采集尺寸），此处保持全部
      // 预留 onlyLarge 功能：未来可扩展 content.js 采集尺寸
      const display = onlyLarge ? allImages.filter(u => true) : allImages;
      imgCountEl.textContent = display.length;

      renderGrid(display);
      zipBtn.disabled = display.length === 0;
    });
  }

  /** 下载全部为 ZIP */
  async function downloadAllZip() {
    if (!window.JSZip) {
      showToast('JSZip 未加载，请检查网络');
      return;
    }
    if (allImages.length === 0) {
      showToast('没有可下载的图片');
      return;
    }

    zipBtn.disabled = true;
    refreshBtn.disabled = true;
    setLoading(true, `正在打包 0 / ${allImages.length}`);

    try {
      const zip = new JSZip();
      const product = sanitizeName(productNameEl.textContent || 'product');
      const folder = zip.folder(product);
      let ok = 0, fail = 0;

      // 并发 3 下载，避免阻塞
      const CONCURRENCY = 3;
      let cursor = 0;
      async function worker() {
        while (cursor < allImages.length) {
          const idx = cursor++;
          const url = allImages[idx];
          try {
            const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!resp.ok) throw new Error(resp.statusText);
            const blob = await resp.blob();
            const ext = guessExt(url);
            folder.file(`${String(idx + 1).padStart(3, '0')}${ext}`, blob);
            ok++;
          } catch (e) {
            // cors 失败时，回退为直接 chrome.downloads
            fail++;
          }
          setLoading(true, `正在打包 ${ok + fail} / ${allImages.length}（失败 ${fail}）`);
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      if (ok === 0) {
        showToast('全部图片下载失败（可能跨域限制）');
        zipBtn.disabled = false;
        refreshBtn.disabled = false;
        setLoading(false);
        return;
      }

      setLoading(true, '正在生成 ZIP…');
      const content = await zip.generateAsync({ type: 'blob' });
      const zipName = `${product}_${new Date().toISOString().slice(0, 10)}.zip`;

      // 用 ObjectURL 触发下载
      const blobUrl = URL.createObjectURL(content);
      chrome.downloads.download({
        url: blobUrl,
        filename: zipName,
        saveAs: true
      }, () => {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      });

      showToast(`ZIP 已生成：成功 ${ok} 张，失败 ${fail} 张`);
    } catch (err) {
      console.error(err);
      showToast('ZIP 打包失败：' + (err.message || '未知错误'));
    } finally {
      zipBtn.disabled = false;
      refreshBtn.disabled = false;
      setLoading(false);
    }
  }

  /** 绑定事件 */
  function bindEvents() {
    refreshBtn.addEventListener('click', triggerRefresh);
    zipBtn.addEventListener('click', downloadAllZip);

    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });

    // 读取并恢复设置
    chrome.storage.local.get(['onlyLarge'], (d) => {
      onlyLarge = !!d.onlyLarge;
      onlyLargeCb.checked = onlyLarge;
    });

    onlyLargeCb.addEventListener('change', (e) => {
      onlyLarge = e.target.checked;
      chrome.storage.local.set({ onlyLarge });
      loadFromStorage();
    });

    // 监听 storage 变化，图片更新自动刷新 UI
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.images) loadFromStorage();
    });
  }

  /** 初始化 */
  function init() {
    bindEvents();
    loadFromStorage();
  }

  // DOM ready 后启动
  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
