/* ============================================================
   图猎 EcomHunter — 官网交互脚本
   功能：
   1. 导航栏滚动时变半透明 + 毛玻璃效果
   2. 平滑滚动到锚点（对不支持 CSS scroll-behavior 的浏览器兜底）
   3. 移动端汉堡菜单开关
   4. 点击导航链接后自动关闭移动端菜单
   ============================================================ */

(function () {
    "use strict";

    /* ---------- 1. 获取 DOM 元素 ---------- */
    const navbar = document.getElementById("navbar");
    const hamburger = document.getElementById("hamburger");
    const navLinks = document.getElementById("navLinks");

    /* ---------- 2. 导航栏滚动效果 ----------
       滚动超过 20px 时添加 .scrolled 类，
       CSS 会将背景变为半透明 + 毛玻璃。 */
    function handleScroll() {
        if (window.scrollY > 20) {
            navbar.classList.add("scrolled");
        } else {
            navbar.classList.remove("scrolled");
        }
    }

    // 初始执行一次（防止页面加载时已是滚动状态）
    handleScroll();

    // 监听滚动事件，使用 passive 提升性能
    window.addEventListener("scroll", handleScroll, { passive: true });

    /* ---------- 3. 移动端汉堡菜单开关 ---------- */
    function toggleMenu() {
        hamburger.classList.toggle("active");
        navLinks.classList.toggle("open");
        // 菜单打开时锁定 body 滚动（可选体验增强）
        const isOpen = navLinks.classList.contains("open");
        document.body.style.overflow = isOpen ? "hidden" : "";
    }

    if (hamburger) {
        hamburger.addEventListener("click", toggleMenu);
    }

    /* ---------- 4. 点击导航链接：平滑滚动 + 关闭移动端菜单 ---------- */
    const allNavAnchors = document.querySelectorAll(
        '.nav-links a[href^="#"], .hero-cta a[href^="#"], a[href^="#download"]'
    );

    allNavAnchors.forEach(function (anchor) {
        anchor.addEventListener("click", function (e) {
            const targetId = this.getAttribute("href");

            // 如果是 "#" 则忽略
            if (targetId === "#") return;

            const targetEl = document.querySelector(targetId);
            if (!targetEl) return;

            // 阻止默认跳转（让我们来控制滚动）
            e.preventDefault();

            // 先关闭移动端菜单
            if (navLinks.classList.contains("open")) {
                hamburger.classList.remove("active");
                navLinks.classList.remove("open");
                document.body.style.overflow = "";
            }

            // 计算目标位置，减去导航栏高度（fixed 定位会遮挡）
            const navHeight = navbar.offsetHeight;
            const targetPosition =
                targetEl.getBoundingClientRect().top + window.scrollY - navHeight + 1;

            // 原生平滑滚动 API（现代浏览器均支持）
            window.scrollTo({
                top: targetPosition,
                behavior: "smooth",
            });
        });
    });

    /* ---------- 5. 点击页面其他区域关闭移动端菜单 ---------- */
    document.addEventListener("click", function (e) {
        if (
            navLinks.classList.contains("open") &&
            !navLinks.contains(e.target) &&
            !hamburger.contains(e.target)
        ) {
            hamburger.classList.remove("active");
            navLinks.classList.remove("open");
            document.body.style.overflow = "";
        }
    });

    /* ---------- 6. ESC 键关闭菜单 ---------- */
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && navLinks.classList.contains("open")) {
            hamburger.classList.remove("active");
            navLinks.classList.remove("open");
            document.body.style.overflow = "";
        }
    });

    /* ---------- 7. 窗口 resize 时重置菜单状态 ----------
       防止从移动端拉回桌面端时菜单仍显示。 */
    window.addEventListener("resize", function () {
        if (window.innerWidth > 768) {
            hamburger.classList.remove("active");
            navLinks.classList.remove("open");
            document.body.style.overflow = "";
        }
    });
})();
