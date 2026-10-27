/**
 * 电商图片下载器 - Content Script
 * 在电商详情页自动抓取所有产品图片（含懒加载属性和 background-image）
 */
(function () {
  'use strict';

  // 存储已发现的图片 URL 集合，去重用
  const foundImages = new Set();

  // 常见的图片懒加载/原图属性名
  const IMG_ATTRS = [
    'src',
    'data-src',
    'data-original',
    'data-image',
    'data-lazy-src',
    'data-lazy',
    'data-actualsrc',
    'data-url',
    'data-ks-lazyload',
    'data-bg',
    'data-progressive',
    'data-fallback-src'
  ];

  // CSS background-image 中的 url() 正则
  const BG_URL_REGEX = /url\(["']?([^"')]+)["']?\)/g;

  /** 把相对路径转为绝对路径 */
  function toAbsolute(url) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
    try {
      return new URL(url, location.href).href;
    } catch (e) {
      return null;
    }
  }

  /** 从 img 元素的各种属性中提取图片 URL */
  function extractFromImg(img) {
    for (const attr of IMG_ATTRS) {
      const val = img.getAttribute(attr);
      if (val) {
        const abs = toAbsolute(val.trim());
        if (abs) foundImages.add(abs);
      }
    }
  }

  /** 从元素的 background-image 样式中提取 URL */
  function extractFromBackground(el) {
    let bg = '';
    try {
      bg = el.style && el.style.backgroundImage;
    } catch (e) {}
    if (!bg) {
      try {
        const cs = getComputedStyle(el);
        bg = cs && cs.backgroundImage;
      } catch (e) {}
    }
    if (!bg || bg === 'none') return;
    let m;
    BG_URL_REGEX.lastIndex = 0;
    while ((m = BG_URL_REGEX.exec(bg)) !== null) {
      const abs = toAbsolute(m[1]);
      if (abs) foundImages.add(abs);
    }
  }

  /** 扫描整页，提取所有图片 */
  function scanAll() {
    // 所有 img 标签
    document.querySelectorAll('img').forEach(extractFromImg);
    // 常见商品图片容器
    const bgSelectors = [
      '.sku-img',
      '.item-gallery',
      '.swiper-slide',
      '.product-image',
      '.goods-image',
      '[class*="image"]',
      '[class*="img"]',
      '[class*="gallery"]',
      '[class*="slide"]'
    ];
    // 带 background-image 的元素
    try {
      for (const sel of bgSelectors) {
        document.querySelectorAll(sel).forEach(extractFromBackground);
      }
    } catch (e) {}
    // 通用扫描：所有带 style 的元素
    try {
      document.querySelectorAll('[style*="background"]').forEach(extractFromBackground);
    } catch (e) {}

    saveImages();
  }

  /** 将当前图片列表写入 chrome.storage.local */
  function saveImages() {
    const list = Array.from(foundImages);
    chrome.storage.local.set({
      images: list,
      productName: document.title || 'product',
      url: location.href,
      updatedAt: Date.now()
    });
  }

  /** MutationObserver：监听 DOM 变化，增量扫描新图片 */
  const observer = new MutationObserver((mutations) => {
    let changed = false;
    for (const m of mutations) {
      // 新增节点
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') {
          extractFromImg(node);
          changed = true;
        } else if (node.querySelectorAll) {
          node.querySelectorAll('img').forEach((img) => {
            extractFromImg(img);
            changed = true;
          });
          // 新增子树中带 background 的元素
          node.querySelectorAll('[style*="background"]').forEach((el) => {
            extractFromBackground(el);
            changed = true;
          });
        }
      });
      // 已有节点属性变化
      if (m.type === 'attributes') {
        const target = m.target;
        if (target.nodeType === 1) {
          if (target.tagName === 'IMG') {
            extractFromImg(target);
            changed = true;
          } else if (m.attributeName === 'style' || m.attributeName.startsWith('data-')) {
            extractFromBackground(target);
            changed = true;
          }
        }
      }
    }
    if (changed) saveImages();
  });

  /** 开始监听 */
  function start() {
    scanAll();
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src', 'data-original', 'data-image', 'data-lazy-src', 'data-ks-lazyload', 'data-fallback-src', 'data-bg', 'data-url', 'data-progressive', 'style']
    });
  }

  // 接收来自 popup 的手动刷新指令
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'RESCan') {
      foundImages.clear();
      scanAll();
      sendResponse({ count: foundImages.size });
    } else if (msg && msg.type === 'GET_COUNT') {
      sendResponse({ count: foundImages.size });
    }
  });

  // 页面加载完成后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  // 额外兜底：window load 后再扫一次（部分电商图片懒加载很晚）
  window.addEventListener('load', () => {
    setTimeout(scanAll, 1500);
    setTimeout(scanAll, 4000);
  }, { once: true });
})();
