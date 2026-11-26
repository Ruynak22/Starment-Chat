/* ============================================================
   StarmentChat — Aurora Glass helper (tiny, no dependencies)
   - Spotlight theo con trỏ trên các bề mặt kính (rAF, passive)
   - Tạm dừng animation khi ẩn tab
   - Giảm hiệu ứng với máy yếu / reduced-motion
   - Stagger nhẹ khi danh sách liên hệ được render
   Không can thiệp vào logic Firebase / DOM của ứng dụng.
   ============================================================ */
(function () {
  "use strict";

  function init() {
    var body = document.body;
    if (!body) return;

    var mqReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var fine = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    var lowPower =
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
      (navigator.deviceMemory && navigator.deviceMemory <= 2);
    var lite = !!(mqReduce || lowPower);

    if (lite) body.classList.add("lg-lite");

    /* Dừng aurora / quang học khi không nhìn vào tab */
    document.addEventListener("visibilitychange", function () {
      body.classList.toggle("lg-paused", document.hidden === true);
    }, { passive: true });

    if (lite || !fine) return;

    /* --- Spotlight theo chuột --- */
    var surfaces = ".auth-card, .modal-card, .composer-shell, .sidebar";
    var active = null;
    var x = 0;
    var y = 0;
    var queued = false;

    function paint() {
      queued = false;
      if (!active) return;
      var r = active.getBoundingClientRect();
      if (!r.width || !r.height) return;
      active.style.setProperty("--mx", (((x - r.left) / r.width) * 100).toFixed(2) + "%");
      active.style.setProperty("--my", (((y - r.top) / r.height) * 100).toFixed(2) + "%");
    }

    function setActive(el) {
      if (el === active) return;
      if (active) active.classList.remove("lg-hover");
      active = el;
      if (active) active.classList.add("lg-hover");
    }

    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var el = e.target && e.target.closest ? e.target.closest(surfaces) : null;
      setActive(el || null);
      if (!active) return;
      x = e.clientX;
      y = e.clientY;
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    }, { passive: true });

    document.addEventListener("pointerleave", function () { setActive(null); }, { passive: true });
    window.addEventListener("blur", function () { setActive(null); }, { passive: true });

    /* --- Stagger danh sách liên hệ (không đụng vào app.js) --- */
    function watchList(id) {
      var list = document.getElementById(id);
      if (!list || typeof MutationObserver === "undefined") return;
      var mo = new MutationObserver(function (records) {
        var order = 0;
        records.forEach(function (rec) {
          Array.prototype.forEach.call(rec.addedNodes, function (node) {
            if (node.nodeType !== 1) return;
            var items = [];
            if (node.matches && node.matches(".user-item")) items.push(node);
            else if (node.querySelectorAll) items = Array.prototype.slice.call(node.querySelectorAll(".user-item"));
            items.forEach(function (el) {
              if (el.dataset.lgEntered) return;
              el.dataset.lgEntered = "1";
              el.style.animationDelay = (order++ * 45) + "ms";
              el.classList.add("lg-enter");
              el.addEventListener("animationend", function () {
                el.classList.remove("lg-enter");
                el.style.animationDelay = "";
                delete el.dataset.lgEntered;
              }, { once: true });
            });
          });
        });
      });
      mo.observe(list, { childList: true, subtree: true });
    }

    ["connections", "requests", "searchResults"].forEach(watchList);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
