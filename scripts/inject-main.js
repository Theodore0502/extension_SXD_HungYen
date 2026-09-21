// =========================================================================
// VINASYNET AUTO-CONFIRM OVERRIDE (CHẠY TRONG MAIN WORLD CỦA TRANG WEB)
// Tự động bỏ qua hộp thoại xác nhận window.confirm & Chuyển thẳng trang xóa
// =========================================================================

(function () {
  try {
    // 1. Ghi đè trực tiếp hàm confirm trong Window của Main World
    window.confirm = function (message) {
      console.log("[Vinasynet Extension] Auto-Confirm [OK]:", message);
      return true;
    };

    // 2. Tự động thay đổi inline onclick trên các nút xóa để chạy thẳng hàm chuyển trang
    function patchDeleteButtons() {
      const delButtons = document.querySelectorAll('a[id*="lnkDelete"], a.bactive.del, a.del, a.gcmd[href*="filesdelete"]');
      delButtons.forEach(btn => {
        const href = btn.getAttribute("href") || "";
        if (href.includes("vsnDelMultiChoice")) {
          // Gán thẳng onclick chạy lệnh chuyển trang xóa đa bản ghi (bỏ qua confirm)
          btn.setAttribute("onclick", "if(typeof vsnDelMultiChoice==='function'){vsnDelMultiChoice('filesdelete','systems');} return false;");
        } else if (btn.hasAttribute("onclick")) {
          btn.removeAttribute("onclick");
          btn.onclick = function () { return true; };
        }
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", patchDeleteButtons);
    } else {
      patchDeleteButtons();
    }

    // Quan sát DOM để nếu có bảng bản ghi tải thêm thì cũng tự động xử lý
    const observer = new MutationObserver(() => {
      patchDeleteButtons();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 3. Lắng nghe yêu cầu kích hoạt xóa từ Content Script
    window.addEventListener("VSN_TRIGGER_DELETE_MAIN", function () {
      console.log("[Main World] Đang kích hoạt vsnDelMultiChoice chuyển trang xóa...");
      try {
        if (typeof window.vsnDelMultiChoice === "function") {
          window.vsnDelMultiChoice('filesdelete', 'systems');
        } else {
          const btn = document.getElementById("ctl13_lnkDelete") || document.querySelector('a.bactive.del[id*="lnkDelete"], a.del');
          if (btn) btn.click();
        }
      } catch (e) {
        console.error("[Main World] Lỗi gọi vsnDelMultiChoice:", e);
      }
    });

  } catch (e) {
    console.warn("[Vinasynet Extension] Lỗi inject-main:", e);
  }
})();
