/**
 * Content Script cho ktdl.soxaydung.hungyen.gov.vn
 * - Widget Nổi Cao Cấp (Dark Glassmorphism) học hỏi từ kiến trúc Chrome_Extension_Auto_Upload
 * - Kéo thả di chuyển (Draggable) 100% tự do trên màn hình
 * - 4 Tabs Chuyên Nghiệp: Scan & Đối Chiếu, Test 7 Bước, Xóa Trùng Hàng Loạt, Nhật Ký (Logs)
 * - Thao tác trực tiếp với DOM trang web: Hệ thống lưu trữ điện tử - Vinasynet Software
 */

(function () {
  if (window !== window.top) return; // Chỉ thực thi trên cửa sổ chính (Top Window), bỏ qua hoàn toàn các iframes
  if (window.hasVinasynetFloatingWidgetInjected) return;
  window.hasVinasynetFloatingWidgetInjected = true;

  console.log("⚡ [Vinasynet Extension] Khởi tạo Widget điều khiển trực tiếp trên Web (v1.1.39)!");

  // --- Global State ---
  let isScanning = false;
  let shouldStopScan = false;
  let scanCodesList = [];
  let scanResults = [];

  let isAuto7Running = false;
  let shouldStop7Steps = false;
  let stepsCodesList = [];
  let currentStepIdx = 0;
  let stepsProcessedMap = {};

  let isDeleteRunning = false;
  let shouldStopDelete = false;
  let deleteCodesList = [];
  let deleteResults = [];

  // --- Helper Functions ---
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForCondition(conditionFn, timeoutMs = 3000, checkIntervalMs = 50) {
    const startTime = Date.now();
    while (timeoutMs === 0 || Date.now() - startTime < timeoutMs) {
      try {
        const res = conditionFn();
        if (res) return res;
      } catch (e) {}
      await sleep(checkIntervalMs);
    }
    try {
      return conditionFn();
    } catch (e) {
      return null;
    }
  }

  function highlightElement(el) {
    if (!el) return;
    el.classList.add("auto-uploader-highlight-pulse");
    setTimeout(() => el.classList.remove("auto-uploader-highlight-pulse"), 1500);
  }

  function appendLogToStorage(time, msg, type) {
    try {
      let savedLogs = JSON.parse(sessionStorage.getItem("vsn_saved_logs") || "[]");
      savedLogs.push({ time, msg, type });
      if (savedLogs.length > 200) savedLogs = savedLogs.slice(-200);
      sessionStorage.setItem("vsn_saved_logs", JSON.stringify(savedLogs));

      // Đồng bộ danh sách log sang chrome.storage.local để Popup / Sidebar nhận đầy đủ
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          vsn_saved_logs: savedLogs,
          vsn_latest_log: { time, msg, type, _t: Date.now() }
        });
      }
    } catch (e) {}
  }

  // Helper cập nhật trạng thái thời gian thực của từng mã vào Bảng (đồng bộ tức thì sang Popup & SidePanel)
  function syncLiveTableRow(code, scanResText, keptText, actionNote, statusType = "info") {
    if (!code) return;
    const timeOnly = new Date().toLocaleTimeString("vi-VN");
    let rows = [];
    try {
      const raw = sessionStorage.getItem("vsn_steps_live_rows");
      if (raw) rows = JSON.parse(raw);
    } catch (e) {}

    const idx = rows.findIndex(r => r.code === code);
    if (idx >= 0) {
      if (scanResText) rows[idx].scanResText = scanResText;
      if (keptText && keptText !== "-") rows[idx].keptText = keptText;
      if (actionNote) rows[idx].actionNote = actionNote;
      if (statusType) rows[idx].statusType = statusType;
      rows[idx].time = timeOnly;
    } else {
      rows.push({
        code: code,
        scanResText: scanResText || "Đang lọc...",
        keptText: keptText || "-",
        actionNote: actionNote || "Đang xử lý...",
        statusType: statusType || "info",
        time: timeOnly
      });
    }

    try {
      sessionStorage.setItem("vsn_steps_live_rows", JSON.stringify(rows));
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ vsn_steps_table_records: rows });
      }
    } catch (e) {}
  }

  function logMsg(msg, type = "info") {
    const time = new Date().toLocaleTimeString("vi-VN");
    appendLogToStorage(time, msg, type);

    const logsBox = document.getElementById("vsn-logs-box");
    if (!logsBox) return;

    const entry = document.createElement("div");
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${time}] ${msg}`;

    logsBox.appendChild(entry);
    // Tự động giữ vị trí cuộn hợp lý
    if (logsBox.scrollHeight - logsBox.scrollTop - logsBox.clientHeight < 120) {
      logsBox.scrollTop = logsBox.scrollHeight;
    }
  }

  function restoreSavedLogs() {
    const logsBox = document.getElementById("vsn-logs-box");
    if (!logsBox) return;
    try {
      const raw = sessionStorage.getItem("vsn_saved_logs");
      if (!raw) return;
      const logs = JSON.parse(raw);
      if (Array.isArray(logs) && logs.length > 0) {
        logsBox.innerHTML = "";
        logs.forEach(l => {
          const entry = document.createElement("div");
          entry.className = `log-entry ${l.type || 'info'}`;
          entry.textContent = `[${l.time}] ${l.msg}`;
          logsBox.appendChild(entry);
        });
        logsBox.scrollTop = logsBox.scrollHeight;
      }
    } catch (e) {}
  }

  function parseTextLines(text) {
    if (!text) return [];
    return text.split(/[\r\n,;]+/)
      .map(t => t.trim())
      .filter(t => t.length > 0 && !t.toLowerCase().startsWith('mã') && !t.toLowerCase().startsWith('ký hiệu'));
  }

  // --- Toast Banner trên đỉnh trang Web ---
  function showWebToast(stepTitle, message, type = 'info') {
    let toast = document.getElementById('vsn-web-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vsn-web-toast';
      document.body.appendChild(toast);
    }

    const bgColors = {
      info: '#2563eb',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626'
    };

    const icons = { info: '⚡', success: '✅', warning: '⚠️', danger: '🗑️' };

    toast.style.background = bgColors[type] || bgColors.info;
    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';

    toast.innerHTML = `
      <span style="font-size:18px;">${icons[type] || '⚡'}</span>
      <div>
        <div style="font-size:10px;opacity:0.9;text-transform:uppercase;letter-spacing:0.5px;">Extension Vinasynet Đang Thao Tác</div>
        <div style="font-size:13px;"><b>${stepTitle}:</b> ${message}</div>
      </div>
    `;

    clearTimeout(toast.dismissTimer);
    toast.dismissTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -25px)';
      }
    }, 3500);
  }

  // --- Kéo thả (Draggable Functionality) chuẩn xác ---
  function makeDraggable(el, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      el.style.top = (el.offsetTop - pos2) + "px";
      el.style.left = (el.offsetLeft - pos1) + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // --- Khởi tạo HTML Widget nổi ---
  function initWidget() {
    if (document.getElementById("auto-uploader-widget")) return;

    const widget = document.createElement("div");
    widget.id = "auto-uploader-widget";

    widget.innerHTML = `
      <div id="auto-uploader-header">
        <div class="widget-title-box">
          <span class="widget-title">📂 VINASYNET MANAGER <span style="font-size:10px; opacity:0.8;">v1.1.39</span></span>
          <span class="widget-badge" id="vsn-status-badge">Sẵn sàng</span>
        </div>
        <div class="widget-controls">
          <button class="icon-btn" id="btn-quick-export-audit" title="Tải nhanh Báo Cáo Audit (CSV)">📊</button>
          <button class="icon-btn" id="btn-collapse-widget" title="Thu nhỏ / Mở rộng">➖</button>
        </div>
      </div>

      <!-- TABS -->
      <div class="widget-tabs">
        <button class="tab-btn active" data-tab="tab-scan">🔍 Scan Đối Chiếu</button>
        <button class="tab-btn" data-tab="tab-steps">🕹️ Quy Trình Các Bước</button>
        <button class="tab-btn" data-tab="tab-delete">🗑️ Xóa Trùng</button>
        <button class="tab-btn" data-tab="tab-logs">📜 Nhật Ký</button>
      </div>

      <div id="auto-uploader-body">
        
        <!-- ================= TAB 1: SCAN ĐỐI CHIẾU ================= -->
        <div class="tab-content active" id="tab-scan">
          <div class="step-card">
            <div class="step-card-title">
              <span>📋 Danh Sách Mã Cần Kiểm Tra</span>
              <span id="scan-count-badge" style="font-size:11px; color:#94a3b8;">0 mã</span>
            </div>
            <textarea id="scan-input-list" class="uploader-input" placeholder="Dán danh sách mã vào đây (mỗi dòng 1 mã)..." style="height:65px;"></textarea>
            
            <div class="btn-grid">
              <button class="action-btn btn-primary" id="btn-scan-single">🔍 Scan Mã Đang Chọn</button>
              <button class="action-btn btn-success" id="btn-scan-batch">▶️ Bắt Đầu Scan Batch</button>
            </div>
            <div class="btn-grid">
              <button class="action-btn btn-secondary" id="btn-stop-scan" disabled>⏹️ Dừng Scan</button>
              <button class="action-btn btn-secondary" id="btn-export-scan-csv">📊 Xuất CSV Kết Quả</button>
            </div>
          </div>

          <!-- Counter Stats Grid -->
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-num stat-total" id="stat-total">0</div>
              <div class="stat-label">Tổng Scan</div>
            </div>
            <div class="stat-item">
              <div class="stat-num stat-exist" id="stat-exist">0</div>
              <div class="stat-label">Đã Có (1 HS)</div>
            </div>
            <div class="stat-item">
              <div class="stat-num stat-dup" id="stat-dup">0</div>
              <div class="stat-label">⚠️ Trùng Lặp</div>
            </div>
            <div class="stat-item">
              <div class="stat-num stat-error" id="stat-error">0</div>
              <div class="stat-label">Chưa Có / Lỗi</div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="progress-box">
            <div class="progress-text">
              <span id="scan-progress-label">Tiến độ: 0/0</span>
              <span id="scan-progress-percent">0%</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" id="scan-progress-fill"></div>
            </div>
          </div>

          <!-- Scan Results Table -->
          <div class="step-card">
            <div class="step-card-title">
              <span>📊 Bảng Kết Quả Scan Chi Tiết</span>
              <button class="action-btn btn-secondary" id="btn-clear-scan-table" style="padding:2px 8px; font-size:10px;">Xóa bảng</button>
            </div>
            <div class="table-container">
              <table class="scan-table" id="scan-table">
                <thead>
                  <tr>
                    <th style="width:25px;">#</th>
                    <th style="width:120px;">Mã Hồ Sơ</th>
                    <th style="width:85px;">Trạng Thái</th>
                    <th>Tiêu Đề / Chi Tiết</th>
                    <th style="width:40px;">Xem</th>
                  </tr>
                </thead>
                <tbody id="scan-table-body">
                  <tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có dữ liệu scan</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ================= TAB 2: QUY TRÌNH XỬ LÝ ================= -->
        <!-- ================= TAB 2: QUY TRÌNH XỬ LÝ (ERGONOMIC WORKFLOW) ================= -->
        <div class="tab-content" id="tab-steps">
          <div class="step-card">
            <div class="step-card-title">
              <span>📝 Danh Sách Mã Xử Lý</span>
              <div style="display:flex; gap:4px; align-items:center;">
                <span id="steps-count-badge" style="font-size:11px; color:#4338ca; background:#e0e7ff; padding:1px 6px; font-weight:700; border:1px solid #c7d2fe;">0 mã</span>
                <button class="action-btn btn-secondary" id="btn-steps-paste" style="padding:2px 6px; font-size:10px;" title="Dán nhanh nội dung từ Clipboard">📋 Dán</button>
                <button class="action-btn btn-secondary" id="btn-steps-clear" style="padding:2px 6px; font-size:10px;" title="Xóa ô nhập">🗑️</button>
              </div>
            </div>
            <textarea id="steps-input-list" class="uploader-input" placeholder="Dán danh sách mã vào đây (mỗi dòng 1 mã)..." style="height:55px;"></textarea>
          </div>

          <!-- Thẻ Mã Đang Chọn (Hero Ergonomic Active Card) -->
          <div class="steps-current-card-ergo">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="pulse-indicator"></span>
                <span style="font-weight:700; color:#0f172a; font-size:11.5px;">📌 MÃ ĐANG CHỌN:</span>
                <span class="current-counter-badge" style="background:#ffffff; color:#4338ca; padding:1px 7px; border:1px solid #cbd5e1; font-weight:800; font-size:11px;"><span id="steps-cur-idx">0</span> / <span id="steps-total-cnt">0</span></span>
              </div>
              <div style="display:flex; gap:4px;">
                <button class="action-btn btn-secondary" id="btn-steps-prev" style="padding:2px 8px; font-size:10px;">⏮️ Trước</button>
                <button class="action-btn btn-secondary" id="btn-steps-next" style="padding:2px 8px; font-size:10px;">Tiếp ⏭️</button>
              </div>
            </div>

            <!-- Khung Mã Hiện Tại Kèm Nút Copy Nhanh -->
            <div class="steps-code-box">
              <span id="steps-cur-code" class="steps-code-text">Chưa có mã</span>
              <button class="btn-copy-code" id="btn-copy-cur-code" title="Sao chép mã này vào clipboard">📋 Copy</button>
            </div>
            <div id="steps-cur-status" style="font-size:11px; color:#64748b; display:flex; align-items:center; gap:4px;">
              <span>Trạng thái:</span> <b style="color:#0f172a;">Vui lòng dán danh sách mã</b>
            </div>
          </div>

          <!-- Lưới Nút Bấm Các Bước & Chuỗi Pipeline -->
          <div class="step-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-weight:700; color:#0f172a; font-size:11.5px;">⚡ Quy trình 5 bước thao tác:</span>
              <span style="font-size:10px; color:#64748b; font-style:italic;">B1 ➔ B5 tự động</span>
            </div>

            <!-- Pipeline Chuỗi Mắc Xích Trực Quan -->
            <div class="steps-pipeline-strip">
              <div class="pipeline-node" id="pipe-node-1"><span class="pipeline-node-num">1</span> Tìm mã</div>
              <span class="pipeline-sep">➔</span>
              <div class="pipeline-node" id="pipe-node-2"><span class="pipeline-node-num">2</span> Scan</div>
              <span class="pipeline-sep">➔</span>
              <div class="pipeline-node" id="pipe-node-3"><span class="pipeline-node-num">3</span> Tích & Xóa</div>
              <span class="pipeline-sep">➔</span>
              <div class="pipeline-node" id="pipe-node-4"><span class="pipeline-node-num">4</span> Xóa ngay</div>
              <span class="pipeline-sep">➔</span>
              <div class="pipeline-node" id="pipe-node-5"><span class="pipeline-node-num">5</span> Thoát ra</div>
            </div>

            <div class="steps-7grid" style="grid-template-columns: repeat(5, 1fr);">
              <button class="step-btn step-btn-1" id="btn-s1" title="1. Điền từ khóa & Chọn phông SXD & Lọc">
                <span class="step-badge">B1</span>
                <span class="step-icon">🔍</span>
                <span class="step-title">Tìm mã</span>
              </button>
              <button class="step-btn step-btn-2" id="btn-s2" title="2. Đếm & Scan số bản ghi trên trang">
                <span class="step-badge">B2</span>
                <span class="step-icon">📊</span>
                <span class="step-title">Đếm/Scan</span>
              </button>
              <button class="step-btn step-btn-3" id="btn-s3" title="3. Tích chọn các bản ghi thừa & Bấm Xóa hàng loạt (#ctl13_lnkDelete)">
                <span class="step-badge">B3</span>
                <span class="step-icon">🎯</span>
                <span class="step-title">Tích & Xóa</span>
              </button>
              <button class="step-btn step-btn-4" id="btn-s4" title="4. Chọn Xác nhận xóa & Nhấn Xóa ngay!">
                <span class="step-badge">B4</span>
                <span class="step-icon">💥</span>
                <span class="step-title">Xóa ngay!</span>
              </button>
              <button class="step-btn step-btn-5" id="btn-s5" title="5. Bấm thoát ra để quay lại danh sách quản lý hồ sơ">
                <span class="step-badge">B5</span>
                <span class="step-icon">🔄</span>
                <span class="step-title">Thoát ra</span>
              </button>
            </div>

            <!-- Nút Tự Động Xóa Hàng Loạt Chuẩn Fitts's Law -->
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="btn-auto-run-ergo" id="btn-auto-flow-run" style="flex:1;">
                <span style="font-size:15px;">▶️</span> BẮT ĐẦU TỰ ĐỘNG XÓA HÀNG LOẠT
              </button>
              <button class="btn-auto-stop-ergo" id="btn-auto-flow-stop" disabled title="Dừng khẩn cấp tiến trình (hoặc bấm phím ESC)">
                <span>⏹️ Dừng</span>
                <span class="esc-hint">ESC</span>
              </button>
            </div>

            <!-- Khối Báo Cáo Audit & Xuất File CSV -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.7); padding:6px 10px; border-radius:6px; margin-top:8px; border:1px solid rgba(56,189,248,0.25);">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-size:11px; font-weight:700; color:#38bdf8;">📊 Báo Cáo Audit:</span>
                <span id="audit-count-badge" style="font-size:10.5px; color:#f8fafc; background:#0284c7; padding:1px 6px; border-radius:10px; font-weight:700;">0 hồ sơ</span>
              </div>
              <div style="display:flex; gap:4px;">
                <button class="action-btn btn-primary" id="btn-export-checklist-widget" style="padding:3px 9px; font-size:10.5px; font-weight:700; background:#6366f1; border:none;" title="Tải file Process Checklist (CSV) phân loại 4 nhóm">📋 Checklist CSV</button>
                <button class="action-btn btn-success" id="btn-export-audit-csv" style="padding:3px 9px; font-size:10.5px; font-weight:700; background:#10b981; border:none;" title="Tải file CSV báo cáo kết quả chi tiết">📥 Báo Cáo CSV</button>
                <button class="action-btn btn-secondary" id="btn-clear-audit" style="padding:3px 6px; font-size:10px;" title="Xóa lịch sử audit để làm mới">🗑️</button>
              </div>
            </div>

            <!-- BẢNG KẾT QUẢ TRỰC TIẾP TRÊN TAB 2: GHI LẠI MÃ NÀO ĐÃ OKAY (CHỈ CÒN 1 HỒ SƠ) -->
            <div class="step-card" style="margin-top:8px; padding:6px 8px; border:1px solid #cbd5e1; background:#ffffff;">
              <div class="step-card-title" style="margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; font-weight:700; color:#0f172a;">📋 Danh Sách Mã Đã Xong (Chỉ Còn 1 Bản)</span>
                <span id="steps-done-badge" style="font-size:10px; color:#15803d; background:#dcfce7; padding:1px 6px; border:1px solid #86efac; font-weight:700; border-radius:4px;">0 mã OK</span>
              </div>
              <div class="table-container" style="max-height:165px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:4px;">
                <table class="scan-table" id="steps-table-tab2" style="width:100%; font-size:11px;">
                  <thead>
                    <tr style="background:#f1f5f9; color:#334155;">
                      <th style="width:28px; text-align:center;">#</th>
                      <th style="width:140px;">Mã hồ sơ</th>
                      <th style="width:125px;">Trạng thái</th>
                      <th>Bản giữ lại (#1)</th>
                      <th style="width:70px; text-align:center;">Giờ</th>
                    </tr>
                  </thead>
                  <tbody id="steps-table-body-tab2">
                    <tr><td colspan="5" style="text-align:center; color:#64748b; padding:10px; font-size:11px;">Chưa có mã nào được xử lý xong.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= TAB 3: XÓA TRÙNG HÀNG LOẠT ================= -->
        <div class="tab-content" id="tab-delete">
          <div class="step-card">
            <div class="step-card-title">
              <span>🗑️ Danh Sách Mã Bị Trùng Cần Xóa</span>
              <span id="del-count-badge" style="font-size:11px; color:#94a3b8;">0 mã</span>
            </div>
            <textarea id="del-input-list" class="uploader-input" placeholder="Dán danh sách mã cần xóa trùng..." style="height:65px;"></textarea>

            <div class="btn-grid">
              <button class="action-btn btn-danger" id="btn-start-delete">🗑️ Bắt Đầu Xóa Trùng Hàng Loạt</button>
              <button class="action-btn btn-secondary" id="btn-stop-delete" disabled>⏹️ Dừng</button>
            </div>
            <button class="action-btn btn-secondary" id="btn-export-del-csv" style="margin-top:2px;">📊 Xuất Báo Cáo Xóa Trùng (CSV)</button>
          </div>

          <!-- Counter Stats Grid cho Delete -->
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-num stat-total" id="del-stat-total">0</div>
              <div class="stat-label">Tổng Mã</div>
            </div>
            <div class="stat-item">
              <div class="stat-num stat-exist" id="del-stat-kept">0</div>
              <div class="stat-label">Bản Giữ (#1)</div>
            </div>
            <div class="stat-item">
              <div class="stat-num stat-error" id="del-stat-deleted">0</div>
              <div class="stat-label">Đã Xóa Bỏ</div>
            </div>
            <div class="stat-item">
              <div class="stat-num stat-dup" id="del-stat-skipped">0</div>
              <div class="stat-label">Bỏ Qua / Lỗi</div>
            </div>
          </div>

          <!-- Progress Bar Delete -->
          <div class="progress-box">
            <div class="progress-text">
              <span id="del-progress-label">Tiến độ: 0/0</span>
              <span id="del-progress-percent">0%</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" id="del-progress-fill"></div>
            </div>
          </div>

          <!-- Delete Table -->
          <div class="step-card">
            <div class="step-card-title">
              <span>📋 Lịch Sử Xóa Trùng Chi Tiết</span>
            </div>
            <div class="table-container">
              <table class="scan-table" id="del-table">
                <thead>
                  <tr>
                    <th style="width:25px;">#</th>
                    <th style="width:110px;">Mã</th>
                    <th style="width:80px;">Trạng Thái</th>
                    <th>Bản Giữ (#1)</th>
                    <th>Bản Đã Xóa</th>
                  </tr>
                </thead>
                <tbody id="del-table-body">
                  <tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có lịch sử xóa</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ================= TAB 4: NHẬT KÝ (LOGS) ================= -->
        <div class="tab-content" id="tab-logs">
          <div class="step-card">
            <div class="step-card-title">
              <span>📜 Terminal Logs Thao Tác</span>
              <div style="display:flex; gap:4px;">
                <button class="action-btn btn-success" id="btn-export-audit-logs" style="padding:2px 8px; font-size:10px; background:#10b981; border:none;">📥 Tải Báo Cáo CSV</button>
                <button class="action-btn btn-secondary" id="btn-clear-logs" style="padding:2px 8px; font-size:10px;">Xóa log</button>
              </div>
            </div>
            <div class="logs-box" id="vsn-logs-box">
              <div class="log-entry info">[Sẵn sàng] Widget Extension Vinasynet đã được kết nối trực tiếp với trang web!</div>
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(widget);

    // Kéo thả Header Widget tự do mượt mà
    const header = document.getElementById("auto-uploader-header");
    makeDraggable(widget, header);

    // Thu nhỏ / Mở rộng
    const btnCollapse = document.getElementById("btn-collapse-widget");
    btnCollapse.addEventListener("click", () => {
      widget.classList.toggle("collapsed");
      btnCollapse.textContent = widget.classList.contains("collapsed") ? "➕" : "➖";
    });

    // Chuyển Tab
    const tabBtns = widget.querySelectorAll(".tab-btn");
    const tabContents = widget.querySelectorAll(".tab-content");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-tab");
        tabBtns.forEach(b => b.classList.remove("active"));
        tabContents.forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        const target = document.getElementById(targetId);
        if (target) target.classList.add("active");
        saveState();
      });
    });

    bindEvents();
    loadState();
  }

  // =========================================================================
  // --- CÁC HÀM THAO TÁC TRỰC TIẾP TRÊN TRANG WEB VINASYNET ---
  // =========================================================================

  // Đánh dấu điều hướng nội bộ an toàn
  function markInternalNav() {
    try {
      sessionStorage.setItem("vsn_internal_nav", Date.now().toString());
    } catch (e) {}
  }

  // 1️⃣ BƯỚC 1: Tìm kiếm mã trên Web
  async function searchCodeOnWeb(code) {
    if (!code) return false;
    logMsg(`1️⃣ [Bước 1] Nhập từ khóa "${code}" & Chọn phông SXD & Lọc...`, "info");
    showWebToast("1️⃣ BƯỚC 1: TÌM MÃ", `Đang điền từ khóa "${code}" & Lọc...`, "info");

    // 1. Chọn Phông = 7 (Sở Xây dựng tỉnh Hưng Yên)
    const fondSelect = document.getElementById("cboFonds");
    if (fondSelect) {
      for (let i = 0; i < fondSelect.options.length; i++) {
        if (fondSelect.options[i].value === "7" || fondSelect.options[i].text.includes("Sở Xây dựng")) {
          fondSelect.selectedIndex = i;
          fondSelect.options[i].selected = true;
          break;
        }
      }
      fondSelect.value = "7";
      highlightElement(fondSelect);
      fondSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // 2. Điền mã vào ô tìm kiếm #txtKeyword
    const kwInput = document.getElementById("txtKeyword");
    if (kwInput) {
      highlightElement(kwInput);
      kwInput.value = code;
      kwInput.dispatchEvent(new Event("input", { bubbles: true }));
      kwInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await sleep(250);

    // 3. Kích hoạt chuyển trang kết quả lọc của Vinasynet
    logMsg(`[B1] ✅ Đang tải kết quả lọc cho mã "${code}" trên web...`, "success");
    const cleanKw = code.replace(/ /g, '+').replace(/''/g, '').replace(/'/g, '').replace(/;/g, '').replace(/\$/g, '').replace(/&/g, '');
    const filterUrl = `/systems/filesmanager/vmode/filter/index.aspx?f=7&y=0&g=0&kw=${cleanKw}&am=0,1,2`;
    markInternalNav();
    window.location.href = filterUrl;
    return true;
  }

  // 2️⃣ BƯỚC 2: Quét & Đếm số lượng bản ghi hiển thị trên trang web
  async function scanRowsOnWeb(code) {
    logMsg(`2️⃣ [Bước 2] Đang quét số lượng bản ghi hiển thị trên trang web...`, "info");
    showWebToast("2️⃣ BƯỚC 2: QUÉT HỒ SƠ", "Đang đếm số bản ghi trên màn hình...", "warning");

    const rows = document.querySelectorAll("tr.item");
    const items = [];

    rows.forEach((tr, idx) => {
      highlightElement(tr);

      const symbolCol = tr.querySelector("td:nth-child(3)");
      const symbolText = symbolCol ? symbolCol.textContent.trim() : "";

      const nameCol = tr.querySelector("td.name");
      const titleEl = nameCol ? nameCol.querySelector("h1") : null;
      const titleText = titleEl ? titleEl.textContent.trim() : "";

      let sysCodeText = "";
      if (nameCol) {
        const smenusSpan = nameCol.querySelector(".smenus span");
        if (smenusSpan) {
          const m = smenusSpan.textContent.match(/Mã:\s*([A-Za-z0-9\.\-_]+)/);
          if (m) sysCodeText = m[1].trim();
        }

        let existingBadge = tr.querySelector(".vsn-row-badge");
        if (!existingBadge) {
          const badge = document.createElement("span");
          badge.className = `vsn-row-badge ${idx === 0 ? "vsn-badge-kept" : "vsn-badge-dup"}`;
          badge.textContent = idx === 0 ? "✓ BẢN CHÍNH (#1 - GIỮ)" : `⚠️ BẢN TRÙNG (#${idx + 1} - CẦN XÓA)`;
          nameCol.insertBefore(badge, nameCol.firstChild);
        }
      }

      let iid = "";
      const chkBox = tr.querySelector('input[id^="chkItem"]');
      if (chkBox) iid = chkBox.getAttribute("dpa") || chkBox.id.replace("chkItem", "");

      const detailLink = tr.querySelector('a[href*="filesviewdetail"]');

      items.push({
        index: idx + 1,
        tr: tr,
        iid: iid,
        symbol: symbolText,
        sysCode: sysCodeText,
        title: titleText,
        detailUrl: detailLink ? detailLink.href : ""
      });
    });

    const count = items.length;
    let status = "not-exist";
    let statusText = "";

    if (count > 1) {
      status = "duplicate";
      statusText = `⚠️ Trùng ${count} bản`;
      showWebToast("⚠️ BƯỚC 2: PHÁT HIỆN TRÙNG", `Tìm thấy ${count} hồ sơ trùng!`, "warning");
      logMsg(`[B2] ⚠️ SCAN: Tìm thấy ${count} bản ghi TRÙNG LẶP. Bản #1 được chọn làm bản chính.`, "warning");
    } else if (count === 1) {
      status = "exist";
      statusText = "✅ Có 1 bản (PASS)";
      showWebToast("✅ BƯỚC 2: HỢP LỆ (PASS)", "Chỉ có 1 bản duy nhất, giữ nguyên.", "success");
      logMsg(`[B2] ✅ SCAN: Chỉ có 1 bản ghi duy nhất. Note: PASS`, "success");
    } else {
      status = "not-exist";
      statusText = "❌ Không tìm thấy";
      showWebToast("❌ BƯỚC 2: KHÔNG TÌM THẤY", "Không có bản ghi nào khớp.", "danger");
      logMsg(`[B2] ❌ SCAN: Không tìm thấy bản ghi nào.`, "error");
    }

    return { count, status, statusText, items };
  }

  // Helper inject script vào Main World của trang web (vượt qua sandbox của Content Script)
  function injectScriptToPage(codeStr) {
    try {
      const script = document.createElement("script");
      script.textContent = codeStr;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (e) {
      console.warn("[Vinasynet] Không thể inject script:", e);
    }
  }

  // 3️⃣ BƯỚC 3: Tích chọn các ô checkbox bản ghi trùng thừa (#2 trở đi) & Click nút Xóa (#ctl13_lnkDelete)
  async function clickDeleteButtonOnWeb() {
    logMsg(`3️⃣ [Bước 3] Đang tích chọn bản ghi thừa và chuẩn bị kích hoạt xóa...`, "warning");
    showWebToast("3️⃣ BƯỚC 3: TÍCH CHỌN & XÓA", "Đang tích các bản thừa để xóa...", "warning");

    const rows = document.querySelectorAll("tr.item");
    if (!rows || rows.length <= 1) {
      logMsg(`[B3] ⚠️ Không có bản ghi trùng thừa (>1 bản) trên trang để xóa!`, "warning");
      showWebToast("⚠️ BƯỚC 3: BỎ QUA", "Chỉ có 1 bản hoặc không tìm thấy bản ghi trùng!", "warning");
      return { success: false, message: "Không có bản ghi trùng thừa (>1 bản) để xóa" };
    }

    // 1. Dòng 1 (rows[0]) là bản chính GIỮ LẠI -> Đảm bảo BỎ TÍCH (checked = false)
    const rowKeep = rows[0];
    const chkKeep = rowKeep.querySelector('td.selector input[type="checkbox"], input[id^="chkItem"]');
    if (chkKeep) {
      if (chkKeep.checked) chkKeep.click();
      chkKeep.checked = false;
      chkKeep.removeAttribute("checked");
      chkKeep.dispatchEvent(new Event("change", { bubbles: true }));
    }
    highlightElement(rowKeep);
    rowKeep.style.outline = "2px solid #16a34a";
    rowKeep.style.backgroundColor = "#f0fdf4";

    // 2. Tích chọn toàn bộ các bản trùng thừa từ dòng 2 đến dòng cuối cùng
    let checkedCount = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const chk = row.querySelector('td.selector input[type="checkbox"], input[id^="chkItem"]');
      if (chk) {
        if (!chk.checked) chk.click();
        chk.checked = true;
        chk.setAttribute("checked", "checked");
        chk.dispatchEvent(new Event("change", { bubbles: true }));
        checkedCount++;
      }
      highlightElement(row);
      row.style.outline = "2px solid #dc2626";
      row.style.backgroundColor = "#fee2e2";
    }

    // 3. Override window.confirm trên cả Content Script và Main World của trang web để không bị popup chặn
    window.confirm = function () { return true; };
    injectScriptToPage("window.confirm = function() { return true; };");

    await sleep(100);

    // Chuẩn bị nút xóa đơn lẻ dòng 2 làm phương án dự phòng chắc chắn 100%
    const row2 = rows[1];
    let singleDelBtn = row2.querySelector('a[id*="lnkDelete"], a[href*="filesdelete"], a.gcmd[title*="Xóa"], a i.zmf-delete');
    if (singleDelBtn && singleDelBtn.tagName.toLowerCase() === "i") {
      singleDelBtn = singleDelBtn.closest("a") || singleDelBtn;
    }
    if (!singleDelBtn) {
      const cmdTd = row2.querySelector("td.cmd");
      if (cmdTd) {
        const links = cmdTd.querySelectorAll("a");
        if (links.length > 1) singleDelBtn = links[links.length - 1];
        else if (links.length === 1) singleDelBtn = links[0];
      }
    }

    // 4. Ưu tiên: Kích hoạt nút Xóa hàng loạt trên Toolbar (#ctl13_lnkDelete)
    const multiDelBtn = document.getElementById("ctl13_lnkDelete") ||
                        document.querySelector('a.bactive.del[id*="lnkDelete"], a.bactive.del, a[href*="vsnDelMultiChoice"]');

    if (multiDelBtn && checkedCount > 0) {
      highlightElement(multiDelBtn);
      multiDelBtn.style.outline = "3px solid #dc2626";
      multiDelBtn.style.backgroundColor = "#fca5a5";

      // TRIỆT TIÊU POPUP CONFIRM: Thay đổi thuộc tính onclick để chạy thẳng hàm vsnDelMultiChoice
      multiDelBtn.setAttribute("onclick", "if(typeof vsnDelMultiChoice==='function'){vsnDelMultiChoice('filesdelete','systems');} return false;");

      logMsg(`[B3] 🎯 Đã tích chọn ${checkedCount} bản thừa! Kích hoạt chuyển trang Xóa (#ctl13_lnkDelete)...`, "success");
      showWebToast("🎯 BƯỚC 3: XÓA HÀNG LOẠT", `Đã tích ${checkedCount} bản thừa, đang chuyển sang trang Xóa...`, "success");

      await sleep(100);
      markInternalNav();

      // Kênh 1: Gửi CustomEvent sang Main World cho inject-main.js xử lý
      window.dispatchEvent(new CustomEvent("VSN_TRIGGER_DELETE_MAIN"));

      // Kênh 2: Inject script gọi trực tiếp trong Main World
      injectScriptToPage("if (typeof vsnDelMultiChoice === 'function') { vsnDelMultiChoice('filesdelete', 'systems'); }");

      // Kênh 3: Click chuột vào nút đã được sửa onclick
      multiDelBtn.click();

      // CHỐT CHẶN AN TOÀN (FALLBACK TỰ ĐỘNG SAU 600MS):
      // Nếu sau 600ms trang vẫn chưa chuyển sang filesdelete, tự động mở trang xóa qua nút xóa dòng 2!
      setTimeout(() => {
        if (!window.location.href.includes("filesdelete") && singleDelBtn) {
          logMsg(`[B3] ⚠️ Tự động kích hoạt chuyển trang qua nút xóa dòng 2 (Fallback)...`, "warning");
          const targetHref = singleDelBtn.getAttribute("href") || singleDelBtn.href;
          markInternalNav();
          if (targetHref && (targetHref.startsWith("http") || targetHref.startsWith("/") || targetHref.includes("filesdelete"))) {
            window.location.href = singleDelBtn.href || targetHref;
          } else {
            singleDelBtn.removeAttribute("onclick");
            singleDelBtn.click();
          }
        }
      }, 600);

      return { success: true, count: checkedCount, message: `Đã tích chọn ${checkedCount} bản thừa và kích hoạt chuyển sang trang Xóa` };
    }

    // 5. Dự phòng (Fallback): Nếu không có nút toolbar #ctl13_lnkDelete, bấm nút xóa đơn lẻ ở dòng 2
    if (singleDelBtn) {
      highlightElement(singleDelBtn);
      singleDelBtn.style.outline = "3px solid #dc2626";
      singleDelBtn.style.backgroundColor = "#fca5a5";

      // Triệt tiêu popup confirm của nút xóa đơn lẻ
      singleDelBtn.removeAttribute("onclick");
      singleDelBtn.onclick = function () { return true; };

      const targetHref = singleDelBtn.getAttribute("href") || singleDelBtn.href;
      logMsg(`[B3] 🎯 Đã bấm nút xóa dòng 2 (Chế độ đơn lẻ)! Chuyển sang trang Xóa...`, "success");
      showWebToast("🎯 BƯỚC 3: ĐANG CHUYỂN TRANG", "Đã bấm nút xóa, chuyển sang trang Xóa...", "success");

      await sleep(150);
      markInternalNav();

      if (targetHref && (targetHref.startsWith("http") || targetHref.startsWith("/") || targetHref.includes("filesdelete"))) {
        window.location.href = singleDelBtn.href || targetHref;
      } else {
        singleDelBtn.click();
      }

      return { success: true, count: 1, message: "Đã kích hoạt click nút xóa đơn lẻ dòng 2" };
    }

    logMsg(`[B3] ❌ Không tìm thấy nút xóa nào trên trang!`, "error");
    showWebToast("❌ BƯỚC 3: LỖI", "Không tìm thấy nút xóa", "danger");
    return { success: false, message: "Không tìm thấy nút xóa trên trang" };
  }

  // 4️⃣ BƯỚC 4: Chọn Xác nhận xóa, rồi chọn Xóa ngay! trên trang Xóa bản ghi
  async function confirmAndExecuteDeletePage() {
    logMsg(`4️⃣ [Bước 4] Đang chọn Xác nhận xóa & Xóa ngay...`, "warning");
    showWebToast("4️⃣ BƯỚC 4: XÁC NHẬN XÓA", "Đang chọn Xác nhận xóa & Xóa ngay...", "warning");

    // Tự động vượt qua mọi confirm popup nếu có
    window.confirm = function () { return true; };
    injectScriptToPage("window.confirm = function() { return true; };");

    // 1. Tìm checkbox "Xác nhận xóa" (id="ctl13_chkAccept")
    const chkAccept = document.getElementById("ctl13_chkAccept") ||
                      document.querySelector('input[type="checkbox"][name*="chkAccept"], input[id*="chkAccept"]');

    // 2. Tìm nút "Xóa ngay !" (id="ctl13_btnDelete")
    const btnDelete = document.getElementById("ctl13_btnDelete") ||
                      document.querySelector('input[type="submit"][name*="btnDelete"], input[id*="btnDelete"], input[value*="Xóa ngay"]');

    if (!chkAccept && !btnDelete) {
      logMsg(`[B4] ⚠️ Chưa ở màn hình Xóa bản ghi (không tìm thấy ô Xác nhận xóa hoặc nút Xóa ngay)!`, "error");
      showWebToast("⚠️ BƯỚC 4: CHƯA Ở TRANG XÓA", "Vui lòng bấm Bước 3 trước để mở trang xóa!", "warning");
      return { success: false, message: "Chưa ở màn hình Xóa bản ghi (vui lòng bấm Bước 3 trước)" };
    }

    // Đếm số lượng bản ghi cần xóa được liệt kê trong bảng trang Xóa
    const delRows = document.querySelectorAll(".fDeleteContainer table tr:not(:first-child)");
    const delCount = delRows.length > 0 ? delRows.length : 1;

    // Tick chọn checkbox "Xác nhận xóa"
    if (chkAccept) {
      chkAccept.checked = true;
      highlightElement(chkAccept);
      chkAccept.dispatchEvent(new Event("change", { bubbles: true }));
      logMsg(`[B4] ✅ Đã tick chọn ô "Xác nhận xóa" (Danh sách có ${delCount} bản ghi cần xóa)!`, "success");
    }

    await sleep(150);

    // Kích hoạt nhấn nút "Xóa ngay !"
    if (btnDelete) {
      highlightElement(btnDelete);
      logMsg(`[B4] 🗑️ Đang nhấn nút "${btnDelete.value || 'Xóa ngay !'}" để xóa ${delCount} bản ghi thừa...`, "danger");
      showWebToast("🗑️ BƯỚC 4: ĐANG XÓA", `Đang xóa ${delCount} bản ghi thừa...`, "danger");

      await sleep(100);
      markInternalNav();
      btnDelete.click();
      logMsg(`[B4] 🎉 ĐÃ GỬI LỆNH XÓA THÀNH CÔNG!`, "success");
      return { success: true, count: delCount, message: `Đã chọn Xác nhận xóa và nhấn Xóa ngay cho ${delCount} bản ghi` };
    } else {
      logMsg(`[B4] ⚠️ Không tìm thấy nút Xóa ngay !`, "warning");
      return { success: false, message: "Không tìm thấy nút Xóa ngay !" };
    }
  }

  // 5️⃣ BƯỚC 5: Bấm thoát ra để quay lại danh sách Quản lý hồ sơ
  async function exitBackToListOnWeb() {
    logMsg(`5️⃣ [Bước 5] Đang tìm nút thoát ra để quay lại danh sách...`, "info");
    showWebToast("5️⃣ BƯỚC 5: THOÁT RA", "Đang quay lại danh sách quản lý hồ sơ...", "info");

    // 1. Tìm nút quay lại trên trang Xóa bản ghi (id="ctl13_lnkBack2List")
    const btnBack = document.getElementById("ctl13_lnkBack2List") ||
                    document.querySelector('a[id*="lnkBack2List"], a i.zmf-back, a[href*="filesmanager"]');

    if (btnBack) {
      highlightElement(btnBack);
      const parentA = btnBack.tagName.toLowerCase() === "i" ? (btnBack.closest("a") || btnBack) : btnBack;
      const targetHref = parentA.getAttribute("href") || parentA.href;

      logMsg(`[B5] 🚪 Đã tìm thấy nút Thoát ra! Đang quay lại danh sách...`, "success");
      await sleep(150);

      markInternalNav();
      if (targetHref && (targetHref.startsWith("http") || targetHref.startsWith("/") || targetHref.includes("filesmanager"))) {
        window.location.href = parentA.href || targetHref;
      } else {
        parentA.click();
      }
      return { success: true, message: "Đã nhấn nút Thoát ra, đang quay lại danh sách hồ sơ" };
    }

    // 2. Fallback: Điều hướng trực tiếp về trang Quản lý hồ sơ
    logMsg(`[B5] 🚪 Điều hướng quay lại trang Quản lý hồ sơ...`, "info");
    await sleep(150);
    markInternalNav();
    window.location.href = "http://ktdl.soxaydung.hungyen.gov.vn/systems/filesmanager/index.aspx?am=0,1,2";
    return { success: true, message: "Đã quay lại trang Quản lý hồ sơ" };
  }

  // =========================================================================
  // --- MODULE TỰ ĐỘNG XÓA HÀNG LOẠT XUYÊN TRANG (MULTI-TAB PARALLEL RUNNER) ---
  // =========================================================================

  let isAutoFlowBusy = false;
  window.vsn_force_stopped = false;

  // =========================================================================
  // --- MODULE QUẢN LÝ PROCESS CHECKLIST (4 NHÓM TRẠNG THÁI & KIỂM CHỨNG 10%) ---
  // =========================================================================

  async function getProcessChecklist() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["vsn_process_checklist"], async (res) => {
          if (res && res.vsn_process_checklist && Object.keys(res.vsn_process_checklist).length > 0) {
            resolve(res.vsn_process_checklist);
          } else {
            try {
              const url = chrome.runtime.getURL("process_checklist_seed.json");
              const resp = await fetch(url);
              const seed = await resp.json();
              chrome.storage.local.set({ vsn_process_checklist: seed });
              resolve(seed);
            } catch (e) {
              resolve({});
            }
          }
        });
      } else {
        try {
          const raw = localStorage.getItem("vsn_process_checklist");
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          resolve({});
        }
      }
    });
  }

  async function isSpotCheckEnabledSetting() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["vsn_spot_check_10"], (res) => {
          resolve(res && res.vsn_spot_check_10 !== undefined ? !!res.vsn_spot_check_10 : true);
        });
      } else {
        resolve(true);
      }
    });
  }

  async function updateChecklistEntry(code, statusGroup, detailStatus, recordCount = "-", kept = "-", spotChecked = false) {
    if (!code) return;
    try {
      const checklist = await getProcessChecklist();
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const oldItem = checklist[code] || {};
      checklist[code] = {
        code: code,
        statusGroup: statusGroup,
        detailStatus: detailStatus,
        recordCount: recordCount,
        spotChecked: spotChecked || oldItem.spotChecked || false,
        kept: kept !== "-" ? kept : (oldItem.kept || "-"),
        time: timeStr
      };

      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ vsn_process_checklist: checklist });
      }
      try {
        localStorage.setItem("vsn_process_checklist", JSON.stringify(checklist));
      } catch (e) {}
    } catch (e) {
      console.error("[Checklist] Lỗi cập nhật entry:", e);
    }
  }

  async function exportProcessChecklistCsv() {
    const checklist = await getProcessChecklist();
    const codes = Object.keys(checklist);
    if (codes.length === 0) {
      alert("Chưa có danh sách mã nào trong Process Checklist!");
      return;
    }

    let csvContent = "\uFEFFSTT,Mã hồ sơ,Nhóm trạng thái,Chi tiết trạng thái,Số bản ghi,Kiểm chứng 10%,Bản ghi giữ lại / Tiêu đề,Thời gian cập nhật\n";

    codes.forEach((code, idx) => {
      const item = checklist[code] || {};
      const cleanCode = `"${(item.code || code).replace(/"/g, '""')}"`;
      const cleanGroup = `"${(item.statusGroup || 'CHƯA CHẠY').replace(/"/g, '""')}"`;
      const cleanDetail = `"${(item.detailStatus || '').replace(/"/g, '""')}"`;
      const cleanCount = `"${(item.recordCount !== undefined ? item.recordCount : '-').toString().replace(/"/g, '""')}"`;
      const cleanSpot = item.spotChecked ? '"Đã kiểm chứng (10%)"' : '"Chưa kiểm chứng"';
      const cleanKept = `"${(item.kept || '-').replace(/"/g, '""')}"`;
      const cleanTime = `"${(item.time || '-').replace(/"/g, '""')}"`;

      csvContent += `${idx + 1},${cleanCode},${cleanGroup},${cleanDetail},${cleanCount},${cleanSpot},${cleanKept},${cleanTime}\n`;
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `Process_Checklist_${dateStr}.csv`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logMsg(`📋 [Checklist] Đã xuất file: "${filename}" (${codes.length} mã)!`, "success");
    showWebToast("📋 ĐÃ XUẤT CHECKLIST", `Đã tải về checklist ${codes.length} mã!`, "success");
  }

  // =========================================================================
  // --- MODULE GHI NHẬN AUDIT LOG & XUẤT BÁO CÁO REPORT CSV ---
  // =========================================================================

  // Dọn sạch tàn dư lưu trữ cũ khi nâng cấp v1.1.29
  try {
    if (!localStorage.getItem("vsn_clean_v1129")) {
      localStorage.removeItem("vsn_global_audit_log");
      localStorage.setItem("vsn_clean_v1129", "true");
    }
  } catch (e) {}

  function getAuditLog() {
    try {
      const raw = sessionStorage.getItem("vsn_tab_audit_log");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  // Render trực tiếp kết quả vào Bảng Kết Quả Tab 2 (Quy trình các bước)
  function renderStepsTableTab2() {
    const tbody = document.getElementById("steps-table-body-tab2");
    if (!tbody) return;

    const list = getAuditLog();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:10px; font-size:11px;">Chưa có mã nào được xử lý xong.</td></tr>';
      const badge = document.getElementById("steps-done-badge");
      if (badge) badge.textContent = "0 mã OK";
      return;
    }

    let okCount = 0;
    let html = "";
    // Hiển thị mã mới nhất lên trên
    list.forEach((item, idx) => {
      const isOk = item.status === "CLEAN_OK" || item.status === "DELETED_SUCCESS";
      if (isOk) okCount++;

      let statusBadge = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px;">✅ OK (1 bản)</span>`;
      if (item.status === "DELETED_SUCCESS") {
        statusBadge = `<span style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px;" title="Đã xóa ${item.deletedCount} bản thừa">✅ ĐÃ XÓA (1 bản)</span>`;
      } else if (item.status === "ERROR_SKIPPED") {
        statusBadge = `<span style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px;">⛔ Lỗi máy chủ</span>`;
      } else if (item.status === "NOT_FOUND") {
        statusBadge = `<span style="background:#f1f5f9; color:#64748b; border:1px solid #cbd5e1; padding:1px 5px; border-radius:3px; font-weight:700; font-size:10px;">❓ Không thấy</span>`;
      }

      const keptSymbol = item.symbol && item.symbol !== "-" ? item.symbol : (item.code || "-");
      const timeOnly = item.time ? (item.time.includes(" ") ? item.time.split(" ")[1] : item.time) : "--:--:--";

      html += `<tr style="${isOk ? 'background:#f0fdf4;' : ''}">
        <td style="text-align:center; font-weight:700; color:#475569;">${idx + 1}</td>
        <td style="font-family:monospace; font-weight:700; color:#1e293b;">${item.code}</td>
        <td>${statusBadge}</td>
        <td style="font-size:10.5px; color:#334155; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.title || keptSymbol}">${keptSymbol}</td>
        <td style="text-align:center; font-size:10.5px; color:#64748b;">${timeOnly}</td>
      </tr>`;
    });

    tbody.innerHTML = html;
    const badge = document.getElementById("steps-done-badge");
    if (badge) badge.textContent = `${okCount}/${list.length} mã OK`;
  }

  function saveAuditRecord(record) {
    if (!record || !record.code) return;
    try {
      let list = getAuditLog();
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      
      const newEntry = {
        time: record.time || timeStr,
        code: record.code,
        initialCount: record.initialCount !== undefined ? record.initialCount : "-",
        deletedCount: record.deletedCount !== undefined ? record.deletedCount : 0,
        finalCount: record.finalCount !== undefined ? record.finalCount : "-",
        status: record.status || "INFO",
        statusText: record.statusText || "Đã xử lý",
        symbol: record.symbol || "-",
        sysCode: record.sysCode || "-",
        title: record.title || "-",
        notes: record.notes || ""
      };

      const existingIdx = list.findIndex(item => item.code === record.code);
      if (existingIdx >= 0) {
        if (newEntry.initialCount === "-" && list[existingIdx].initialCount !== "-") {
          newEntry.initialCount = list[existingIdx].initialCount;
        }
        list[existingIdx] = newEntry;
      } else {
        list.push(newEntry);
      }

      sessionStorage.setItem("vsn_tab_audit_log", JSON.stringify(list));
      localStorage.setItem("vsn_global_audit_log", JSON.stringify(list));
      
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          const tableRows = list.map(item => {
            const isOk = item.status === "CLEAN_OK" || item.status === "DELETED_SUCCESS";
            let scanText = "1 bản (CLEAN_OK)";
            if (item.status === "DELETED_SUCCESS") {
              scanText = "1 bản (ĐÃ XÓA TRÙNG)";
            } else if (item.status === "ERROR_SKIPPED") {
              scanText = item.initialCount !== "-" ? `${item.initialCount} bản (ERROR)` : "Lỗi server";
            } else if (item.status === "NOT_FOUND") {
              scanText = "0 bản (NOT_FOUND)";
            } else if (item.initialCount !== "-") {
              scanText = `${item.initialCount} bản`;
            }
            const keptText = item.title && item.title !== '-' ? item.title : (item.symbol || item.code);
            const noteText = item.statusText + (item.notes ? ` (${item.notes})` : '');
            const stType = isOk ? 'success' : (item.status === 'ERROR_SKIPPED' ? 'danger' : 'warning');
            const timeOnly = item.time ? (item.time.includes(' ') ? item.time.split(' ')[1] : item.time) : '--:--:--';
            return {
              code: item.code,
              scanResText: scanText,
              keptText: keptText,
              actionNote: noteText,
              statusType: stType,
              time: timeOnly
            };
          });
          sessionStorage.setItem("vsn_steps_live_rows", JSON.stringify(tableRows));
          chrome.storage.local.set({ 
            vsn_audit_records: list,
            vsn_steps_table_records: tableRows
          }); 
        } catch (e) {}
      }

      updateAuditBadge();
      renderStepsTableTab2();
      
      addDeleteResultRow(list.length, {
        code: newEntry.code,
        statusText: newEntry.statusText,
        deletedCount: newEntry.deletedCount,
        kept: { symbol: newEntry.symbol, sysCode: newEntry.sysCode }
      });
    } catch (e) {
      console.error("[Audit] Lỗi lưu audit log:", e);
    }
  }

  function updateAuditBadge() {
    try {
      const list = getAuditLog();
      const badge = document.getElementById("audit-count-badge");
      if (badge) badge.textContent = `${list.length} hồ sơ`;

      const statTotal = document.getElementById("del-stat-total");
      const statKept = document.getElementById("del-stat-kept");
      const statDeleted = document.getElementById("del-stat-deleted");
      const statSkipped = document.getElementById("del-stat-skipped");

      if (statTotal) statTotal.textContent = list.length;
      if (statKept) statKept.textContent = list.filter(x => x.status === "CLEAN_OK" || x.status === "DELETED_SUCCESS").length;
      if (statDeleted) {
        const totalDel = list.reduce((sum, item) => sum + (Number(item.deletedCount) || 0), 0);
        statDeleted.textContent = totalDel;
      }
      if (statSkipped) statSkipped.textContent = list.filter(x => x.status === "ERROR_SKIPPED" || x.status === "NOT_FOUND").length;
    } catch (e) {}
  }

  function clearAuditLogData(showToast = false) {
    try {
      sessionStorage.removeItem("vsn_tab_audit_log");
      sessionStorage.removeItem("vsn_steps_live_rows");
      localStorage.removeItem("vsn_global_audit_log");
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(["vsn_tab_audit_log", "vsn_global_audit_log", "vsn_audit_records", "vsn_steps_table_records"]);
      }
    } catch (e) {}
    updateAuditBadge();
    renderStepsTableTab2();
    const tbody = document.getElementById("del-table-body");
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có lịch sử xóa</td></tr>';
    if (showToast) {
      logMsg("🗑️ Đã xóa sạch dữ liệu Bảng kết quả Audit Log.", "warning");
      showWebToast("🗑️ ĐÃ XÓA AUDIT", "Đã dọn sạch dữ liệu báo cáo audit.", "info");
    }
  }

  function clearAuditLog() {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử Audit Log để bắt đầu phiên mới?")) return;
    clearAuditLogData(true);
  }

  // Tự động làm mới sạch sẽ Bảng Kết Quả và Nhật Ký khi dán hoặc nạp List Mã Mới
  function resetTableAndLogsForNewList(newCount) {
    // 1. Reset Bảng kết quả (Tab 2 và Tab 3)
    clearAuditLogData(false);

    // 2. Reset Nhật ký logs (cả trong sessionStorage và DOM hiển thị)
    try {
      sessionStorage.removeItem("vsn_saved_logs");
      sessionStorage.removeItem("vsn_tab_auto_flow");
      sessionStorage.removeItem("vsn_auto_flow_state");
    } catch (e) {}
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(["vsn_auto_flow", "vsn_saved_logs"]);
    }
    const logsBox = document.getElementById("vsn-logs-box");
    if (logsBox) {
      logsBox.innerHTML = "";
    }

    // 3. Reset trạng thái luồng xử lý và các biến đếm
    currentStepIdx = 0;
    stepsProcessedMap = {};
    updateAutoControlsUI(false);
    highlightActiveStep(0);

    // 4. Ghi 1 dòng thông báo khởi đầu duy nhất với timestamp
    logMsg(`📋 [Danh Sách Mới] Đã nạp thành công ${newCount} mã hồ sơ! Tiến độ (0/${newCount} mã, 0%), Bảng kết quả và Nhật ký đã được tự động làm mới để bắt đầu phiên mới.`, "success");
    showWebToast("📋 ĐÃ NẠP LIST MỚI", `Tự động reset Bảng & Log cho ${newCount} mã mới!`, "success");
  }

  function exportAuditReportCsv() {
    let list = getAuditLog();
    if (!list || list.length === 0) {
      alert("Chưa có dữ liệu nào được ghi nhận! Vui lòng thực hiện kiểm tra hoặc xóa trùng trước khi xuất báo cáo.");
      return;
    }

    let csvContent = "\uFEFF"; // Tiền tố UTF-8 BOM để Excel tiếng Việt không bị lỗi font
    csvContent += '"STT","Thời Gian","Mã Hồ Sơ","Kết Quả Xử Lý","Số Lượng Ban Đầu","Số Bản Đã Xóa","Số Bản Còn Lại","Ký Hiệu Bản Giữ (#1)","Mã Hệ Thống Bản Giữ","Tiêu Đề Hồ Sơ Giữ Lại","Ghi Chú Chi Tiết Thao Tác"\n';

    list.forEach((item, idx) => {
      const cleanTitle = (item.title || "").replace(/"/g, '""').replace(/\r?\n/g, ' ');
      const cleanNotes = (item.notes || "").replace(/"/g, '""').replace(/\r?\n/g, ' ');
      const cleanSymbol = (item.symbol || "").replace(/"/g, '""');
      const cleanSysCode = (item.sysCode || "").replace(/"/g, '""');
      
      let cleanStatus = "OKAY (1 bản duy nhất)";
      if (item.status === "DELETED_SUCCESS") cleanStatus = `Đã xóa trùng ${item.deletedCount} bản (Còn lại 1 bản)`;
      else if (item.status === "ERROR_SKIPPED") cleanStatus = "Bỏ qua (Lỗi máy chủ khóa bản ghi)";
      else if (item.status === "NOT_FOUND") cleanStatus = "Không tìm thấy hồ sơ";
      else if (item.statusText) cleanStatus = item.statusText.replace(/"/g, '""');

      const cleanCode = (item.code || "").replace(/"/g, '""');
      const finalCnt = (item.status === "CLEAN_OK" || item.status === "DELETED_SUCCESS") ? 1 : (item.finalCount || "-");

      csvContent += `"${idx + 1}","${item.time}","${cleanCode}","${cleanStatus}","${item.initialCount}","${item.deletedCount}","${finalCnt}","${cleanSymbol}","${cleanSysCode}","${cleanTitle}","${cleanNotes}"\n`;
    });

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `Bao_cao_xu_ly_quy_trinh_xoa_${dateStr}.csv`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logMsg(`📥 [Audit] Đã xuất file báo cáo: "${filename}" (${list.length} hồ sơ)!`, "success");
    showWebToast("📥 ĐÃ XUẤT BÁO CÁO CSV", `Đã tải về báo cáo ${list.length} hồ sơ!`, "success");
  }

  // Lắng nghe phím ESC để người dùng có thể bấm dừng khẩn cấp bất cứ lúc nào!
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      stopAutoDeleteFlow();
    }
  });

  // Kiểm tra cờ dừng khẩn cấp trên tab hiện tại hoặc toàn cục
  function isFlowForceStopped() {
    if (window.vsn_force_stopped) return true;
    try {
      if (sessionStorage.getItem("vsn_tab_force_stopped") === "true") return true;
      const state = getTabFlowState();
      if (!state || !state.isRunning) return true;
    } catch (e) {}
    return false;
  }

  // Lấy trạng thái của riêng Tab này từ sessionStorage (Hỗ trợ duplicate tab chạy song song nhiều luồng)
  function getTabFlowState() {
    try {
      const raw = sessionStorage.getItem("vsn_tab_auto_flow");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  async function setTabFlowState(state) {
    try {
      if (isFlowForceStopped() || !state || !state.isRunning) {
        sessionStorage.removeItem("vsn_tab_auto_flow");
        sessionStorage.setItem("vsn_tab_force_stopped", "true");
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            vsn_auto_flow: { isRunning: false, forceStopped: true, stoppedAt: Date.now() }
          });
        }
      } else {
        sessionStorage.setItem("vsn_tab_auto_flow", JSON.stringify(state));
        sessionStorage.removeItem("vsn_tab_force_stopped");
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ vsn_auto_flow: state });
        }
      }
    } catch (e) {}
  }

  async function startAutoDeleteFlow(codes) {
    if (!codes || codes.length === 0) {
      alert("Vui lòng nhập danh sách mã cần tự động xóa!");
      return;
    }

    window.vsn_force_stopped = false;
    isAutoFlowBusy = false;
    shouldStopDelete = false;
    try {
      sessionStorage.removeItem("vsn_tab_force_stopped");
    } catch (e) {}

    const state = {
      isRunning: true,
      codes: codes,
      currentIndex: 0,
      currentStep: 1,
      deletedTotal: 0,
      codeRetryMap: {} // Theo dõi số lần xóa của từng mã để chống lặp vô hạn
    };

    // Đồng bộ các mã nạp mới vào Process Checklist
    try {
      const checklist = await getProcessChecklist();
      let hasNew = false;
      codes.forEach(c => {
        if (!checklist[c]) {
          checklist[c] = {
            code: c,
            statusGroup: "CHƯA CHẠY",
            detailStatus: "Chưa xử lý (Còn trong hàng đợi)",
            recordCount: "-",
            spotChecked: false,
            kept: "-",
            time: "-"
          };
          hasNew = true;
        }
      });
      if (hasNew && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ vsn_process_checklist: checklist });
      }
    } catch (e) {}

    // Lưu state ngay lập tức vào sessionStorage và chrome.storage
    await setTabFlowState(state);

    logMsg(`▶️ [Auto] BẮT ĐẦU TỰ ĐỘNG XÓA CHO ${codes.length} MÃ HỒ SƠ TRÊN TAB NÀY...`, "info");
    showWebToast("▶️ BẮT ĐẦU TỰ ĐỘNG XÓA", `Khởi chạy tự động xóa cho ${codes.length} mã! (Bấm ESC để dừng)`, "info");

    updateAutoControlsUI(true);
    highlightActiveStep(1);
    checkAndRunAutoFlow();
  }

  async function stopAutoDeleteFlow(syncStorage = true) {
    if (window.vsn_force_stopped && !syncStorage) return;

    window.vsn_force_stopped = true;
    isAutoFlowBusy = false;
    shouldStopDelete = true;
    try {
      sessionStorage.setItem("vsn_tab_force_stopped", "true");
      sessionStorage.removeItem("vsn_tab_auto_flow");
    } catch (e) {}

    if (syncStorage && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set({
          vsn_auto_flow: { isRunning: false, forceStopped: true, stoppedAt: Date.now() }
        });
      } catch (e) {}
    }

    updateAutoControlsUI(false);
    highlightActiveStep(0);
    logMsg("⏹️ [Auto] ĐÃ DỪNG HOÀN TOÀN TIẾN TRÌNH TỰ ĐỘNG XÓA TRÊN TAB NÀY!", "danger");
    showWebToast("⏹️ ĐÃ DỪNG HOÀN TOÀN", "Đã dừng tiến trình. Trang sẽ không tự động reload hay chạy tiếp.", "danger");
  }

  function updateAutoControlsUI(isRunning) {
    const btnRun = document.getElementById("btn-auto-flow-run");
    const btnStop = document.getElementById("btn-auto-flow-stop");
    if (btnRun) btnRun.disabled = isRunning;
    if (btnStop) btnStop.disabled = !isRunning;
  }

  function highlightActiveStep(stepNum) {
    for (let i = 1; i <= 5; i++) {
      const btn = document.getElementById(`btn-s${i}`);
      if (btn) {
        if (i === stepNum) {
          btn.classList.add("step-active");
        } else {
          btn.classList.remove("step-active");
        }
      }
      const pipe = document.getElementById(`pipe-node-${i}`);
      if (pipe) {
        if (i === stepNum) {
          pipe.classList.add("active");
        } else {
          pipe.classList.remove("active");
        }
      }
    }
  }

  async function checkAndRunAutoFlow() {
    if (isAutoFlowBusy || isFlowForceStopped()) return;

    // Chỉ đọc state độc lập của riêng tab này từ sessionStorage
    const state = getTabFlowState();

    // Nếu không có state hoặc đã dừng, dừng lại ngay lập tức (không tự ý kích hoạt từ storage toàn cục)
    if (!state || !state.isRunning) {
      updateAutoControlsUI(false);
      highlightActiveStep(0);
      return;
    }

    isAutoFlowBusy = true;
    updateAutoControlsUI(true);

    try {
      const codes = state.codes || [];
      const idx = state.currentIndex || 0;

      if (idx >= codes.length) {
        // ĐÃ HOÀN TẤT TẤT CẢ MÃ TRONG DANH SÁCH CỦA TAB NÀY
        state.isRunning = false;
        state.currentStep = 0;
        await setTabFlowState(null);
        updateAutoControlsUI(false);
        highlightActiveStep(0);
        logMsg(`🏁 [Auto] 🎉 CHÚC MỪNG! ĐÃ HOÀN TẤT TỰ ĐỘNG XÓA ${codes.length} MÃ TRÊN TAB NÀY!`, "success");
        showWebToast("🎉 HOÀN TẤT!", `Đã tự động xử lý xong toàn bộ ${codes.length} mã! Đang chuẩn bị tải Báo Cáo Audit CSV...`, "success");
        
        // Tự động kích hoạt tải Báo cáo Audit CSV
        setTimeout(() => {
          exportAuditReportCsv();
        }, 1000);
        return;
      }

      const code = codes[idx];
      let step = state.currentStep || 1;
      state.codeRetryMap = state.codeRetryMap || {};

      // Nhận diện loại trang web hiện tại
      const currentUrl = window.location.href;
      const isDeletePage = currentUrl.includes("filesdelete") || !!document.getElementById("ctl13_btnDelete") || !!document.getElementById("ctl13_lnkBack2List");

      // =========================================================================
      // NẾU ĐANG Ở TRANG "XÓA BẢN GHI" (filesdelete)
      // Các bước diễn ra ở đây: Bước 4 (Xóa ngay) hoặc Bước 5 (Thoát ra)
      // =========================================================================
      if (isDeletePage) {
        const btnDelete = document.getElementById("ctl13_btnDelete");
        const chkAccept = document.getElementById("ctl13_chkAccept");

        if (step === 4 && (btnDelete || chkAccept)) {
          if (isFlowForceStopped()) return;

          // 4️⃣ BƯỚC 4: TICK XÁC NHẬN XÓA & NHẤN XÓA NGAY (SIÊU TỐC)
          highlightActiveStep(4);
          syncLiveTableRow(code, null, null, "4️⃣ [B4] Đã tick Xác nhận xóa & Nhấn Xóa ngay !", "danger");
          logMsg(`4️⃣ [B4: Xác nhận xóa] Tick chọn "Xác nhận xóa" & Nhấn "Xóa ngay !" cho mã "${code}"...`, "danger");
          showWebToast("4️⃣ BƯỚC 4: XÓA NGAY !", `Xác nhận & gửi lệnh xóa bản thừa của mã: ${code}`, "danger");

          // Cập nhật trạng thái tiếp theo là Bước 5
          state.currentStep = 5;
          await setTabFlowState(state);
          if (isFlowForceStopped()) return;

          // Thực thi Bước 4: Tick chọn & submit form ASP.NET
          const execRes = await confirmAndExecuteDeletePage();
          const delNum = (execRes && execRes.count) || 1;
          state.deletedTotal = (state.deletedTotal || 0) + delNum;
          if (!state.codeDeletedCount) state.codeDeletedCount = {};
          state.codeDeletedCount[code] = (state.codeDeletedCount[code] || 0) + delNum;
          await setTabFlowState(state);

          // Dừng lại để form ASP.NET POST lên server và reload trang xóa
          return;
        } else {
          if (isFlowForceStopped()) return;

          // 5️⃣ BƯỚC 5: BẤM THOÁT RA ĐỂ QUAY LẠI DANH SÁCH QUẢN LÝ HỒ SƠ
          highlightActiveStep(5);
          syncLiveTableRow(code, null, null, "5️⃣ [B5] Bấm Thoát ra quay lại danh sách Quản lý hồ sơ", "info");
          logMsg(`5️⃣ [B5: Thoát ra] Bấm nút "Thoát ra" quay lại Quản lý hồ sơ để kiểm tra kết quả mã "${code}"...`, "info");
          showWebToast("5️⃣ BƯỚC 5: THOÁT RA", "Bấm Thoát ra quay lại danh sách hồ sơ...", "info");

          // Đặt trạng thái tiếp theo là Bước 1
          state.currentStep = 1;
          await setTabFlowState(state);

          await sleep(200);
          if (isFlowForceStopped()) return;

          // Thực thi Bước 5: Bấm Thoát ra
          await exitBackToListOnWeb();
          return;
        }
      }

      // =========================================================================
      // NẾU ĐANG Ở TRANG "QUẢN LÝ HỒ SƠ" (filesmanager)
      // Các bước diễn ra ở đây: Bước 1 (Tìm mã), Bước 2 (Đếm/Scan), Bước 3 (Click xóa)
      // =========================================================================

      // Nếu bước hiện tại là 4 hoặc 5 mà lại đang ở trang quản lý hồ sơ ➔ đặt về Bước 1
      if (step === 4 || step === 5) {
        step = 1;
        state.currentStep = 1;
        await setTabFlowState(state);
      }

      // --- 1️⃣ BƯỚC 1: TÌM KIẾM MÃ (TỐC ĐỘ CAO & CHECKLIST PASS / SPOT-CHECK) ---
      if (step === 1) {
        // KIỂM TRA CHECKLIST ĐỐI VỚI MÃ NÀY (BỎ QUA MÃ ĐÃ HOÀN THÀNH, LẤY MẪU KIỂM CHỨNG 10%)
        if (!state.isCurrentSpotChecking) {
          const checklist = await getProcessChecklist();
          const checkItem = checklist[code];
          const spotCheckEnabled = await isSpotCheckEnabledSetting();

          if (checkItem && checkItem.statusGroup === "HOÀN THÀNH") {
            let runSpotCheck = false;
            if (spotCheckEnabled && !checkItem.spotChecked) {
              runSpotCheck = Math.random() < 0.10;
            }

            if (!runSpotCheck) {
              if (isFlowForceStopped()) return;

              logMsg(`⏩ [Checklist: Pass] Mã #${idx + 1}/${codes.length} "${code}" đã HOÀN THÀNH trước đó -> Bỏ qua để tiết kiệm thời gian!`, "info");
              syncLiveTableRow(code, "1 bản (ĐÃ PASS)", checkItem.kept || "-", "Checklist: Đã hoàn thành (Tự động Pass)", "success");

              state.currentIndex = idx + 1;
              state.currentStep = 1;
              await setTabFlowState(state);
              await sleep(60);
              if (isFlowForceStopped()) return;
              isAutoFlowBusy = false;
              checkAndRunAutoFlow();
              return;
            } else {
              state.isCurrentSpotChecking = true;
              await setTabFlowState(state);
              logMsg(`🎲 [Checklist: Kiểm chứng 10%] Mã #${idx + 1}/${codes.length} "${code}" đã note HOÀN THÀNH -> Đang quét xác thực thực tế trên Vinasynet...`, "warning");
              showWebToast("🎲 KIỂM CHỨNG 10%", `Đang quét xác thực mã đã pass: ${code}`, "warning");
            }
          }
        }

        if (isFlowForceStopped()) return;
        highlightActiveStep(1);
        syncLiveTableRow(code, "Đang lọc...", "-", `1️⃣ [B1] Đang điền mã & Lọc (#${idx + 1}/${codes.length})`, "info");
        logMsg(`1️⃣ [B1: Điền & Lọc] Mã #${idx + 1}/${codes.length}: Đang tìm kiếm mã "${code}" trên Vinasynet...`, "info");
        showWebToast("1️⃣ BƯỚC 1: TÌM MÃ", `Đang nhập mã "${code}" & Lọc hồ sơ...`, "info");

        // Chờ ô tìm kiếm sẵn sàng (nhanh, kiểm tra mỗi 30ms)
        await waitForCondition(() => {
          const kw = document.getElementById("txtKeyword");
          const fond = document.getElementById("cboFonds");
          return kw && fond;
        }, 4000, 30);
        if (isFlowForceStopped()) return;

        // Chờ ngắn 350ms cho ổn định
        await sleep(350);
        if (isFlowForceStopped()) return;

        // Đặt trước trạng thái tiếp theo là Bước 2
        state.currentStep = 2;
        await setTabFlowState(state);
        if (isFlowForceStopped()) return;

        // Kích hoạt tìm kiếm mã (reload trang sang vmode/filter)
        await searchCodeOnWeb(code);
        return;
      }

      // --- 2️⃣ BƯỚC 2: ĐẾM & SCAN SỐ LƯỢNG BẢN GHI (TỐC ĐỘ CAO + CHỐNG LẶP VÔ HẠN) ---
      if (step === 2) {
        if (isFlowForceStopped()) return;
        highlightActiveStep(2);
        showWebToast("2️⃣ BƯỚC 2: ĐẾM & SCAN", `Đang quét các bản ghi của mã: ${code}...`, "warning");

        // Chờ danh sách kết quả tải xong
        await waitForCondition(() => {
          return document.querySelectorAll("tr.item").length > 0 || document.querySelector(".fFilterBox");
        }, 1500, 30);
        if (isFlowForceStopped()) return;

        await sleep(250);
        if (isFlowForceStopped()) return;

        const scanRes = await scanRowsOnWeb(code);
        if (isFlowForceStopped()) return;
        logMsg(`2️⃣ [B2: Quét bản ghi] Mã "${code}": Phát hiện ${scanRes.count} bản ghi (${scanRes.statusText})`, scanRes.count > 1 ? "warning" : "success");

        if (!state.codeInitialCount) state.codeInitialCount = {};
        if (state.codeInitialCount[code] === undefined) {
          state.codeInitialCount[code] = scanRes.count;
        }

        const firstItem = (scanRes.items && scanRes.items[0]) || {};

        if (scanRes.count > 1) {
          // Kiểm tra số lần đã thử xóa mã này để chống lặp vô hạn
          const retries = (state.codeRetryMap[code] || 0) + 1;
          state.codeRetryMap[code] = retries;

          if (retries > 2) {
            // Đã xóa 2 lần mà server không bớt bản ghi (bản ghi bị khóa hoặc không thể xóa)
            logMsg(`⚠️ [B2: Lỗi máy chủ] Mã "${code}" đã thử xóa ${retries - 1} lần nhưng máy chủ không cho phép. BỎ QUA để chuyển tiếp!`, "danger");
            showWebToast("⚠️ BỎ QUA MÃ NÀY", `Mã ${code} không thể xóa trên server. Chuyển tiếp!`, "danger");

            syncLiveTableRow(code, `${scanRes.count} bản (ERROR)`, firstItem.title || firstItem.symbol || "-", "Bỏ qua (Lỗi máy chủ khóa bản ghi)", "danger");

            await updateChecklistEntry(code, "LỖI KHÓA", "Bỏ qua: Lỗi máy chủ khóa bản ghi không cho xóa", scanRes.count, firstItem.title || firstItem.symbol || "-", false);

            saveAuditRecord({
              code: code,
              initialCount: state.codeInitialCount[code] || scanRes.count,
              deletedCount: (state.codeDeletedCount && state.codeDeletedCount[code]) || 0,
              finalCount: scanRes.count,
              status: "ERROR_SKIPPED",
              statusText: "Bỏ qua (Lỗi máy chủ)",
              symbol: firstItem.symbol || "-",
              sysCode: firstItem.sysCode || "-",
              title: firstItem.title || "-",
              notes: "Đã thử gửi lệnh xóa nhưng máy chủ Vinasynet không cập nhật (bản ghi bị khóa)"
            });

            // Chuyển sang mã tiếp theo, không reload lặp vô hạn
            state.currentIndex = idx + 1;
            state.currentStep = 1;
            await setTabFlowState(state);

            await sleep(400);
            if (isFlowForceStopped()) return;
            isAutoFlowBusy = false;
            checkAndRunAutoFlow();
            return;
          }

          // PHÁT HIỆN BẢN TRÙNG THỪA (>1 bản): Chuyển ngay sang Bước 3
          syncLiveTableRow(code, `${scanRes.count} bản`, firstItem.title || "-", `2️⃣ [B2] Có ${scanRes.count} bản trùng (Chuẩn bị xóa)`, "warning");
          logMsg(`[B2: Phát hiện trùng] ⚠️ Mã "${code}" có ${scanRes.count} bản ghi trùng lặp. Chuyển sang Bước 3 để tích chọn bản thừa...`, "warning");
          showWebToast("⚠️ BẢN GHI TRÙNG", `Có ${scanRes.count} bản! Chuyển sang Bước 3...`, "warning");

          state.currentStep = 3;
          await setTabFlowState(state);

          await sleep(150);
          if (isFlowForceStopped()) return;
          isAutoFlowBusy = false;
          checkAndRunAutoFlow();
          return;
        } else {
          // KHÔNG CÒN BẢN THỪA (CHỈ CÒN 1 BẢN HOẶC 0 BẢN):
          if (scanRes.count === 1) {
            logMsg(`[B2: Đạt chuẩn] ✅ MÃ "${code}" ĐÃ OKAY (chỉ còn 1 hồ sơ duy nhất - PASS)!`, "success");
            showWebToast("✅ ĐẠT CHUẨN", `Mã ${code} đã sạch (1 bản duy nhất). Chuyển mã tiếp theo!`, "success");

            const wasDeleted = state.codeDeletedCount && (state.codeDeletedCount[code] > 0);
            const actualDelCount = wasDeleted 
              ? state.codeDeletedCount[code] 
              : Math.max(0, (state.codeInitialCount[code] || 1) - 1);

            const isSpot = !!state.isCurrentSpotChecking;
            if (isSpot) {
              logMsg(`✅ [Checklist: Xác thực 10%] Mã "${code}" kiểm chứng thực tế CHÍNH XÁC (1 bản duy nhất)!`, "success");
              state.isCurrentSpotChecking = false;
              await setTabFlowState(state);
            }

            const scanBadgeText = actualDelCount > 0 ? "1 bản (ĐÃ XÓA TRÙNG)" : "1 bản (CLEAN_OK)";
            const finalNoteText = actualDelCount > 0 
              ? `Đã xóa trùng ${actualDelCount} bản (Còn lại 1 bản duy nhất)` 
              : (isSpot ? "Đạt chuẩn (Đã kiểm chứng thực tế 10%)" : "Đạt chuẩn (1 bản duy nhất) - Hồ sơ chuẩn, không có bản trùng thừa");
            const keptTitleText = firstItem.title || firstItem.symbol || "-";

            syncLiveTableRow(code, scanBadgeText, keptTitleText, finalNoteText, "success");

            await updateChecklistEntry(
              code, 
              "HOÀN THÀNH", 
              actualDelCount > 0 ? "Đã xóa trùng (1 bản duy nhất)" : (isSpot ? "Độc nhất chuẩn (Đã kiểm chứng 10%)" : "Độc nhất chuẩn (1 bản)"), 
              1, 
              keptTitleText, 
              isSpot
            );

            saveAuditRecord({
              code: code,
              initialCount: state.codeInitialCount[code] !== undefined ? state.codeInitialCount[code] : 1,
              deletedCount: actualDelCount,
              finalCount: 1,
              status: actualDelCount > 0 ? "DELETED_SUCCESS" : "CLEAN_OK",
              statusText: actualDelCount > 0 ? "Đã xóa trùng (1 bản duy nhất)" : "Đạt chuẩn (1 bản duy nhất)",
              symbol: firstItem.symbol || "-",
              sysCode: firstItem.sysCode || "-",
              title: firstItem.title || "-",
              notes: actualDelCount > 0 ? `Đã xóa thành công ${actualDelCount} bản trùng thừa, giữ lại bản chính #1` : "Hồ sơ chuẩn, không có bản trùng thừa"
            });
          } else {
            logMsg(`[B2: Kiểm tra lại] ❓ Mã "${code}": Không tìm thấy bản ghi nào trên hệ thống!`, "warning");

            syncLiveTableRow(code, "0 bản (NOT_FOUND)", "-", "Không tìm thấy hồ sơ nào trên hệ thống Vinasynet", "warning");

            await updateChecklistEntry(code, "CẦN SCAN LẠI", "Không tìm thấy hồ sơ (Nghi ngờ timeout/cần xác thực lại)", 0, "-", false);

            saveAuditRecord({
              code: code,
              initialCount: 0,
              deletedCount: 0,
              finalCount: 0,
              status: "NOT_FOUND",
              statusText: "Không tìm thấy hồ sơ",
              symbol: "-",
              sysCode: "-",
              title: "-",
              notes: "Không tìm thấy hồ sơ nào với mã này trên hệ thống Vinasynet"
            });
          }

          // Chuyển sang mã tiếp theo và đặt lại về Bước 1
          state.currentIndex = idx + 1;
          state.currentStep = 1;
          await setTabFlowState(state);

          await sleep(350);
          if (isFlowForceStopped()) return;
          isAutoFlowBusy = false;
          checkAndRunAutoFlow();
          return;
        }
      }

      // --- 3️⃣ BƯỚC 3: TÍCH CHỌN BẢN GHI THỪA & CLICK XÓA (#ctl13_lnkDelete) ---
      if (step === 3) {
        if (isFlowForceStopped()) return;
        highlightActiveStep(3);
        syncLiveTableRow(code, null, null, "3️⃣ [B3] Tích chọn bản thừa & Kích hoạt xóa (#ctl13_lnkDelete)", "warning");
        logMsg(`3️⃣ [B3: Tích & Xóa] Đang tích chọn các bản trùng thừa (#2, #3...) & Kích hoạt xóa (#ctl13_lnkDelete) cho mã "${code}"...`, "warning");
        showWebToast("3️⃣ BƯỚC 3: TÍCH & XÓA", `Đang chọn các bản trùng thừa của mã: ${code}...`, "warning");

        // Đặt trước trạng thái tiếp theo là Bước 4
        state.currentStep = 4;
        await setTabFlowState(state);

        await sleep(150);
        if (isFlowForceStopped()) return;

        const clickRes = await clickDeleteButtonOnWeb();
        if (!clickRes || !clickRes.success) {
          logMsg(`[B3] ⚠️ Không thực hiện được bước xóa: ${clickRes ? clickRes.message : 'N/A'}. Quay lại Bước 1...`, "danger");
          state.currentStep = 1;
          await setTabFlowState(state);
        }
        return;
      }
    } catch (err) {
      console.error("[Auto] Lỗi trong tiến trình tự động:", err);
      logMsg(`[Auto] ❌ Lỗi: ${err.message}`, "error");
    } finally {
      isAutoFlowBusy = false;
    }
  }

  // =========================================================================
  // --- BIND SỰ KIỆN GIAO DIỆN WIDGET ---
  // =========================================================================

  function bindEvents() {
    // --- TAB 1: SCAN LOGIC ---
    const scanInput = document.getElementById("scan-input-list");
    const scanBadge = document.getElementById("scan-count-badge");
    const btnScanSingle = document.getElementById("btn-scan-single");
    const btnScanBatch = document.getElementById("btn-scan-batch");
    const btnStopScan = document.getElementById("btn-stop-scan");
    const btnExportScanCsv = document.getElementById("btn-export-scan-csv");
    const btnClearScanTable = document.getElementById("btn-clear-scan-table");

    function updateScanCount() {
      scanCodesList = parseTextLines(scanInput.value);
      if (scanBadge) scanBadge.textContent = `${scanCodesList.length} mã`;
      saveState();
    }
    if (scanInput) scanInput.addEventListener("input", updateScanCount);

    if (btnScanSingle) {
      btnScanSingle.addEventListener("click", async () => {
        if (scanCodesList.length === 0) {
          alert("Vui lòng dán danh sách mã cần kiểm tra!");
          return;
        }
        const code = scanCodesList[0];
        await searchCodeOnWeb(code);
        await sleep(500);
        const res = await scanRowsOnWeb(code);
        addScanResultRow(1, code, res);
      });
    }

    if (btnScanBatch) {
      btnScanBatch.addEventListener("click", async () => {
        if (isScanning) return;
        if (scanCodesList.length === 0) {
          alert("Vui lòng dán danh sách mã cần kiểm tra!");
          return;
        }

        isScanning = true;
        shouldStopScan = false;
        btnScanBatch.disabled = true;
        btnStopScan.disabled = false;
        scanResults = [];
        document.getElementById("scan-table-body").innerHTML = "";

        let countExist = 0, countDup = 0, countError = 0;
        const total = scanCodesList.length;

        for (let i = 0; i < total; i++) {
          if (shouldStopScan) break;
          const code = scanCodesList[i];

          await searchCodeOnWeb(code);
          await sleep(400);

          const res = await scanRowsOnWeb(code);
          scanResults.push({ code, res });

          if (res.count > 1) countDup++;
          else if (res.count === 1) countExist++;
          else countError++;

          addScanResultRow(i + 1, code, res);

          // Cập nhật stats
          document.getElementById("stat-total").textContent = i + 1;
          document.getElementById("stat-exist").textContent = countExist;
          document.getElementById("stat-dup").textContent = countDup;
          document.getElementById("stat-error").textContent = countError;

          // Progress
          const pct = Math.round(((i + 1) / total) * 100);
          document.getElementById("scan-progress-label").textContent = `Tiến độ: ${i + 1}/${total}`;
          document.getElementById("scan-progress-percent").textContent = `${pct}%`;
          document.getElementById("scan-progress-fill").style.width = `${pct}%`;

          await sleep(200);
        }

        isScanning = false;
        btnScanBatch.disabled = false;
        btnStopScan.disabled = true;
        logMsg(`🏁 Đã hoàn tất Scan Batch (${scanResults.length}/${total})!`, "success");
        saveState();
      });
    }

    if (btnStopScan) {
      btnStopScan.addEventListener("click", () => {
        shouldStopScan = true;
        btnStopScan.disabled = true;
        logMsg("⏹️ Đã nhấn dừng tiến trình Scan.", "warning");
      });
    }

    if (btnClearScanTable) {
      btnClearScanTable.addEventListener("click", () => {
        document.getElementById("scan-table-body").innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:12px;">Chưa có dữ liệu scan</td></tr>';
        scanResults = [];
        document.getElementById("stat-total").textContent = "0";
        document.getElementById("stat-exist").textContent = "0";
        document.getElementById("stat-dup").textContent = "0";
        document.getElementById("stat-error").textContent = "0";
        document.getElementById("scan-progress-fill").style.width = "0%";
        document.getElementById("scan-progress-percent").textContent = "0%";
        document.getElementById("scan-progress-label").textContent = "Tiến độ: 0/0";
        saveState();
      });
    }

    if (btnExportScanCsv) {
      btnExportScanCsv.addEventListener("click", () => {
        if (scanResults.length === 0) {
          alert("Chưa có kết quả để xuất CSV!");
          return;
        }
        exportScanCsv();
      });
    }

    // --- TAB 2: 7 STEPS LOGIC ---
    const stepsInput = document.getElementById("steps-input-list");
    const stepsCountBadge = document.getElementById("steps-count-badge");
    const stepsCurIdx = document.getElementById("steps-cur-idx");
    const stepsTotalCnt = document.getElementById("steps-total-cnt");
    const stepsCurCode = document.getElementById("steps-cur-code");
    const stepsCurStatus = document.getElementById("steps-cur-status");
    const btnStepsPrev = document.getElementById("btn-steps-prev");
    const btnStepsNext = document.getElementById("btn-steps-next");

    let lastLoggedStepsCount = -1;
    function updateStepsView(fromUserInput = false) {
      stepsCodesList = parseTextLines(stepsInput.value);
      if (stepsCountBadge) stepsCountBadge.textContent = `${stepsCodesList.length} mã`;
      if (stepsTotalCnt) stepsTotalCnt.textContent = stepsCodesList.length;

      if (fromUserInput && stepsCodesList.length !== lastLoggedStepsCount) {
        lastLoggedStepsCount = stepsCodesList.length;
        if (stepsCodesList.length > 0) {
          logMsg(`📋 [Danh Sách] Đã nạp thành công ${stepsCodesList.length} mã hồ sơ vào hàng đợi xử lý!`, "success");
          showWebToast("📋 ĐÃ NẠP MÃ", `Đã nhận diện ${stepsCodesList.length} mã hồ sơ!`, "success");
        }
      }

      if (stepsCodesList.length === 0) {
        currentStepIdx = 0;
        if (stepsCurIdx) stepsCurIdx.textContent = "0";
        if (stepsCurCode) stepsCurCode.textContent = "Chưa có mã";
        if (stepsCurStatus) stepsCurStatus.textContent = "Trạng thái: Vui lòng dán danh sách mã";
        return;
      }

      if (currentStepIdx >= stepsCodesList.length) currentStepIdx = stepsCodesList.length - 1;
      if (currentStepIdx < 0) currentStepIdx = 0;

      if (stepsCurIdx) stepsCurIdx.textContent = currentStepIdx + 1;
      const code = stepsCodesList[currentStepIdx];
      if (stepsCurCode) stepsCurCode.textContent = code;

      const info = stepsProcessedMap[code];
      if (info) {
        if (stepsCurStatus) stepsCurStatus.textContent = `Trạng thái: ${info.statusText}`;
      } else {
        if (stepsCurStatus) stepsCurStatus.textContent = `Trạng thái: Mã mới (${currentStepIdx + 1}/${stepsCodesList.length})`;
      }
      saveState();
    }

    if (stepsInput) {
      stepsInput.addEventListener("input", () => updateStepsView(true));

      // Bắt sự kiện Paste (Ctrl+V hoặc chuột phải) để auto reset bảng và log
      stepsInput.addEventListener("paste", () => {
        setTimeout(() => {
          const codes = parseTextLines(stepsInput.value);
          if (codes.length > 0) {
            resetTableAndLogsForNewList(codes.length);
            updateStepsView(false);
          }
        }, 50);
      });
    }

    if (btnStepsPrev) {
      btnStepsPrev.addEventListener("click", () => {
        if (currentStepIdx > 0) {
          currentStepIdx--;
          updateStepsView();
        }
      });
    }

    if (btnStepsNext) {
      btnStepsNext.addEventListener("click", () => {
        if (currentStepIdx < stepsCodesList.length - 1) {
          currentStepIdx++;
          updateStepsView();
        }
      });
    }

    // Các nút công thái học bổ trợ (Dán, Xóa rỗng, Copy mã)
    const btnStepsPaste = document.getElementById("btn-steps-paste");
    if (btnStepsPaste) {
      btnStepsPaste.addEventListener("click", async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            stepsInput.value = text;
            const codes = parseTextLines(text);
            if (codes.length > 0) {
              resetTableAndLogsForNewList(codes.length);
            }
            updateStepsView(false);
          } else {
            showWebToast("⚠️ CLIPBOARD RỖNG", "Không tìm thấy nội dung văn bản!", "warning");
          }
        } catch (err) {
          showWebToast("⚠️ CHÚ Ý", "Vui lòng dán trực tiếp bằng phím tắt Ctrl + V!", "warning");
        }
      });
    }

    const btnStepsClear = document.getElementById("btn-steps-clear");
    if (btnStepsClear) {
      btnStepsClear.addEventListener("click", () => {
        stepsInput.value = "";
        lastLoggedStepsCount = 0;
        clearAuditLogData(false);
        try { sessionStorage.removeItem("vsn_saved_logs"); } catch (e) {}
        const logsBox = document.getElementById("vsn-logs-box");
        if (logsBox) logsBox.innerHTML = "";
        updateStepsView(false);
        logMsg("🗑️ Đã xóa rỗng danh sách mã và làm mới Bảng kết quả.", "info");
        showWebToast("🗑️ ĐÃ XÓA", "Đã xóa rỗng danh sách mã và reset Bảng.", "info");
      });
    }

    const btnCopyCurCode = document.getElementById("btn-copy-cur-code");
    if (btnCopyCurCode) {
      btnCopyCurCode.addEventListener("click", () => {
        const code = stepsCodesList[currentStepIdx];
        if (code) {
          navigator.clipboard.writeText(code).then(() => {
            showWebToast("📋 ĐÃ SAO CHÉP", `Đã chép mã "${code}" vào Clipboard!`, "success");
          }).catch(() => {
            showWebToast("❌ LỖI", "Không thể sao chép mã!", "danger");
          });
        } else {
          showWebToast("⚠️ CHƯA CÓ MÃ", "Vui lòng nhập hoặc chọn mã hợp lệ!", "warning");
        }
      });
    }

    // Gắn sự kiện các nút bước
    const btnS1 = document.getElementById("btn-s1");
    if (btnS1) {
      btnS1.addEventListener("click", async () => {
        const code = stepsCodesList[currentStepIdx];
        if (!code) return alert("Vui lòng nhập mã!");
        await searchCodeOnWeb(code);
      });
    }

    const btnS2 = document.getElementById("btn-s2");
    if (btnS2) {
      btnS2.addEventListener("click", async () => {
        const code = stepsCodesList[currentStepIdx];
        const res = await scanRowsOnWeb(code);
        stepsProcessedMap[code] = res;
        updateStepsView();
      });
    }

    const btnS3 = document.getElementById("btn-s3");
    if (btnS3) {
      btnS3.addEventListener("click", async () => {
        await clickDeleteButtonOnWeb();
      });
    }

    const btnS4 = document.getElementById("btn-s4");
    if (btnS4) {
      btnS4.addEventListener("click", async () => {
        await confirmAndExecuteDeletePage();
      });
    }

    const btnS5 = document.getElementById("btn-s5");
    if (btnS5) {
      btnS5.addEventListener("click", async () => {
        await exitBackToListOnWeb();
      });
    }

    // Gắn sự kiện Tự Động Xóa Hàng Loạt trên Widget
    const btnAutoRun = document.getElementById("btn-auto-flow-run");
    const btnAutoStop = document.getElementById("btn-auto-flow-stop");

    if (btnAutoRun) {
      btnAutoRun.addEventListener("click", () => {
        const inputEl = document.getElementById("steps-input-list");
        const codes = parseTextLines(inputEl ? inputEl.value : "");
        if (codes.length === 0) {
          alert("Vui lòng dán danh sách mã vào ô trên trước khi bấm tự động xóa!");
          return;
        }
        startAutoDeleteFlow(codes);
      });
    }

    if (btnAutoStop) {
      btnAutoStop.addEventListener("click", () => {
        stopAutoDeleteFlow();
      });
    }

    // --- TAB 3: DELETE LOGIC ---
    const delInput = document.getElementById("del-input-list");
    const delCountBadge = document.getElementById("del-count-badge");
    const btnStartDel = document.getElementById("btn-start-delete");
    const btnStopDel = document.getElementById("btn-stop-delete");
    const btnExportDelCsv = document.getElementById("btn-export-del-csv");

    function updateDelCount() {
      deleteCodesList = parseTextLines(delInput.value);
      if (delCountBadge) delCountBadge.textContent = `${deleteCodesList.length} mã`;
      saveState();
    }
    if (delInput) delInput.addEventListener("input", updateDelCount);

    if (btnStartDel) {
      btnStartDel.addEventListener("click", async () => {
        if (deleteCodesList.length === 0) return alert("Vui lòng nhập danh sách mã cần xóa trùng!");

        // Tự động đồng bộ mã sang tab Quy trình các bước và chạy luồng thật 5 bước
        const stepsInput = document.getElementById("steps-input-list");
        if (stepsInput) {
          stepsInput.value = deleteCodesList.join("\n");
        }

        // Chuyển sang hiển thị Tab Quy trình các bước
        const stepsTabBtn = document.querySelector('.tab-btn[data-tab="tab-steps"]');
        if (stepsTabBtn) stepsTabBtn.click();

        logMsg(`🚀 Chuyển hướng sang Quy trình 5 bước để tự động xóa thật cho ${deleteCodesList.length} mã...`, "info");
        startAutoDeleteFlow(deleteCodesList);
      });
    }

    if (btnStopDel) {
      btnStopDel.addEventListener("click", () => {
        shouldStopDelete = true;
        btnStopDel.disabled = true;
        logMsg("⏹️ Đã nhấn dừng tiến trình Xóa Trùng.", "warning");
        stopAutoDeleteFlow();
        setTimeout(() => {
          btnStopDel.disabled = false;
        }, 1000);
      });
    }

    if (btnExportDelCsv) {
      btnExportDelCsv.addEventListener("click", () => {
        exportAuditReportCsv();
      });
    }

    // Gắn sự kiện các nút Audit Report & Process Checklist
    const btnExportChecklistWidget = document.getElementById("btn-export-checklist-widget");
    if (btnExportChecklistWidget) {
      btnExportChecklistWidget.addEventListener("click", () => {
        exportProcessChecklistCsv();
      });
    }

    const btnExportAuditCsv = document.getElementById("btn-export-audit-csv");
    if (btnExportAuditCsv) {
      btnExportAuditCsv.addEventListener("click", () => {
        exportAuditReportCsv();
      });
    }

    const btnQuickExportAudit = document.getElementById("btn-quick-export-audit");
    if (btnQuickExportAudit) {
      btnQuickExportAudit.addEventListener("click", () => {
        exportAuditReportCsv();
      });
    }

    const btnExportAuditLogs = document.getElementById("btn-export-audit-logs");
    if (btnExportAuditLogs) {
      btnExportAuditLogs.addEventListener("click", () => {
        exportAuditReportCsv();
      });
    }

    const btnClearAudit = document.getElementById("btn-clear-audit");
    if (btnClearAudit) {
      btnClearAudit.addEventListener("click", () => {
        clearAuditLog();
      });
    }

    // --- TAB 4: CLEAR LOGS ---
    const btnClearLogs = document.getElementById("btn-clear-logs");
    if (btnClearLogs) {
      btnClearLogs.addEventListener("click", () => {
        try { sessionStorage.removeItem("vsn_saved_logs"); } catch (e) {}
        document.getElementById("vsn-logs-box").innerHTML = '<div class="log-entry info">[Nhật ký đã xóa trắng]</div>';
      });
    }
  }

  // Helper thêm dòng vào Bảng Scan
  function addScanResultRow(idx, code, res) {
    const tbody = document.getElementById("scan-table-body");
    if (!tbody) return;

    // Xóa dòng placeholder nếu có
    if (tbody.children.length === 1 && tbody.children[0].textContent.includes("Chưa có dữ liệu")) {
      tbody.innerHTML = "";
    }

    const tr = document.createElement("tr");
    let badgeClass = "badge-exist";
    if (res.status === "duplicate") badgeClass = "badge-dup";
    else if (res.status === "not-exist") badgeClass = "badge-error";

    const first = (res.items && res.items[0]) || {};
    let titleHtml = first.title || "-";
    if (res.count > 1) {
      titleHtml = `⚠️ <b>Trùng ${res.count} HS:</b> ` + res.items.map(it => `[${it.symbol || 'N/A'}] (Mã: ${it.sysCode || 'N/A'})`).join(" | ");
    }

    let linkHtml = first.detailUrl ? `<a href="${first.detailUrl}" target="_blank" style="color:#38bdf8;text-decoration:none;">🔗</a>` : "-";

    tr.innerHTML = `
      <td>${idx}</td>
      <td style="font-weight:700; color:#f8fafc;">${code}</td>
      <td><span class="${badgeClass}">${res.statusText}</span></td>
      <td style="font-size:10.5px;">${titleHtml}</td>
      <td>${linkHtml}</td>
    `;
    tbody.appendChild(tr);
  }

  // Helper thêm dòng vào Bảng Delete
  function addDeleteResultRow(idx, rec) {
    const tbody = document.getElementById("del-table-body");
    if (!tbody) return;

    if (tbody.children.length === 1 && tbody.children[0].textContent.includes("Chưa có lịch sử")) {
      tbody.innerHTML = "";
    }

    const tr = document.createElement("tr");
    const kept = rec.kept || {};
    let keptText = kept.symbol ? `[${kept.symbol}] (Mã: ${kept.sysCode || 'N/A'})` : "-";
    let delText = rec.deletedCount > 0 ? `Đã xóa ${rec.deletedCount} bản thừa` : "-";

    tr.innerHTML = `
      <td>${idx}</td>
      <td style="font-weight:700; color:#f8fafc;">${rec.code}</td>
      <td><span class="${rec.deletedCount > 0 ? 'badge-dup' : 'badge-exist'}">${rec.statusText}</span></td>
      <td style="color:#10b981; font-size:10.5px;">${keptText}</td>
      <td style="color:#f87171; font-size:10.5px;">${delText}</td>
    `;
    tbody.appendChild(tr);
  }

  // Xuất CSV Scan
  function exportScanCsv() {
    let csvContent = "\uFEFFSTT,Ma Ho So,So Luong Tim Thay,Trang Thai,Tieu De Ho So,Link Chi Tiet\n";
    scanResults.forEach((item, idx) => {
      const code = item.code;
      const res = item.res;
      const first = (res.items && res.items[0]) || {};
      const titleClean = (first.title || "").replace(/"/g, '""');
      csvContent += `"${idx + 1}","${code}","${res.count}","${res.statusText}","${titleClean}","${first.detailUrl || ''}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Ket_qua_scan_ho_so_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Xuất CSV Delete
  function exportDeleteCsv() {
    let csvContent = "\uFEFFSTT,Ma Ho So,Trang Thai,Ban Ghi Duoc Giu Lai,So Ban Ghi Da Xoa\n";
    deleteResults.forEach((rec, idx) => {
      const kept = rec.kept || {};
      const keptStr = kept.symbol ? `[${kept.symbol}] (Mã: ${kept.sysCode || 'N/A'})` : "-";
      csvContent += `"${idx + 1}","${rec.code}","${rec.statusText}","${keptStr}","${rec.deletedCount}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Bao_cao_xoa_trung_ho_so_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Auto Save & Restore State (Riêng biệt cho từng Tab bằng sessionStorage) ---
  function saveState() {
    const scanInput = document.getElementById("scan-input-list");
    const stepsInput = document.getElementById("steps-input-list");
    const delInput = document.getElementById("del-input-list");

    const state = {
      scanText: scanInput ? scanInput.value : "",
      stepsText: stepsInput ? stepsInput.value : "",
      delText: delInput ? delInput.value : "",
      currentStepIdx: currentStepIdx,
      stepsProcessedMap: stepsProcessedMap
    };
    try {
      sessionStorage.setItem("vsn_widget_state", JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem("vsn_widget_state");
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state) return;

      const scanInput = document.getElementById("scan-input-list");
      if (scanInput && state.scanText) {
        scanInput.value = state.scanText;
        scanCodesList = parseTextLines(state.scanText);
        const badge = document.getElementById("scan-count-badge");
        if (badge) badge.textContent = `${scanCodesList.length} mã`;
      }

      const stepsInput = document.getElementById("steps-input-list");
      if (stepsInput && state.stepsText) {
        stepsInput.value = state.stepsText;
        stepsCodesList = parseTextLines(state.stepsText);
        currentStepIdx = state.currentStepIdx || 0;
        stepsProcessedMap = state.stepsProcessedMap || {};
        const countBadge = document.getElementById("steps-count-badge");
        const totalCnt = document.getElementById("steps-total-cnt");
        if (countBadge) countBadge.textContent = `${stepsCodesList.length} mã`;
        if (totalCnt) totalCnt.textContent = stepsCodesList.length;
        if (stepsCodesList.length > 0) {
          const curIdx = document.getElementById("steps-cur-idx");
          const curCode = document.getElementById("steps-cur-code");
          if (curIdx) curIdx.textContent = currentStepIdx + 1;
          if (curCode) curCode.textContent = stepsCodesList[currentStepIdx];
        }
      }

      const delInput = document.getElementById("del-input-list");
      if (delInput && state.delText) {
        delInput.value = state.delText;
        deleteCodesList = parseTextLines(state.delText);
        const delBadge = document.getElementById("del-count-badge");
        if (delBadge) delBadge.textContent = `${deleteCodesList.length} mã`;
      }

      // Khôi phục hiển thị dữ liệu Audit Log lên bảng và badge
      updateAuditBadge();
      renderStepsTableTab2();
      restoreSavedLogs();
      const existingAudit = getAuditLog();
      if (existingAudit && existingAudit.length > 0) {
        const delTbody = document.getElementById("del-table-body");
        if (delTbody) {
          delTbody.innerHTML = "";
          existingAudit.forEach((entry, i) => {
            addDeleteResultRow(i + 1, {
              code: entry.code,
              statusText: entry.statusText,
              deletedCount: entry.deletedCount,
              kept: { symbol: entry.symbol, sysCode: entry.sysCode }
            });
          });
        }
      }
    } catch (e) {}
  }

  // --- Lắng nghe Message từ Popup / Sidebar ---
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log("📩 [Vinasynet Extension] Nhận message từ Popup/Sidebar:", request);

      if (request.action === "STEP1_SEARCH") {
        searchCodeOnWeb(request.code).then(res => {
          sendResponse({ success: !!res });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }

      if (request.action === "STEP2_SCAN") {
        scanRowsOnWeb(request.code).then(res => {
          sendResponse({ success: true, ...res });
        }).catch(err => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }

      if (request.action === "STEP3_CLICK_DELETE") {
        clickDeleteButtonOnWeb().then(res => {
          sendResponse(res);
        }).catch(err => {
          sendResponse({ success: false, message: err.message });
        });
        return true;
      }

      if (request.action === "STEP4_CONFIRM_AND_DELETE") {
        confirmAndExecuteDeletePage().then(res => {
          sendResponse(res);
        }).catch(err => {
          sendResponse({ success: false, message: err.message });
        });
        return true;
      }

      if (request.action === "STEP5_EXIT_BACK") {
        exitBackToListOnWeb().then(res => {
          sendResponse(res);
        }).catch(err => {
          sendResponse({ success: false, message: err.message });
        });
        return true;
      }

      if (request.action === "START_AUTO_FLOW") {
        startAutoDeleteFlow(request.codes).then(() => {
          sendResponse({ success: true });
        }).catch(err => {
          sendResponse({ success: false, message: err.message });
        });
        return true;
      }

      if (request.action === "STOP_AUTO_FLOW") {
        stopAutoDeleteFlow().then(() => {
          sendResponse({ success: true });
        }).catch(err => {
          sendResponse({ success: false, message: err.message });
        });
        return true;
      }
    });
  }

  // Lắng nghe tín hiệu ngắt khẩn cấp từ Popup / Sidebar qua chrome.storage
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.vsn_auto_flow) {
        const val = changes.vsn_auto_flow.newValue;
        if (val && (val.isRunning === false || val.forceStopped)) {
          if (!window.vsn_force_stopped) {
            stopAutoDeleteFlow(false);
          }
        }
      }
    });
  }

  // Tự động kiểm tra và tiếp tục tiến trình tự động xóa khi trang web load xong
  setTimeout(() => {
    if (window.vsn_force_stopped || sessionStorage.getItem("vsn_tab_force_stopped") === "true") {
      return;
    }
    checkAndRunAutoFlow();
  }, 400);

})();
