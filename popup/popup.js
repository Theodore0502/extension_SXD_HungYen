document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Single Check Elements
    const singleInput = document.getElementById('singleInput');
    const btnSingleCheck = document.getElementById('btnSingleCheck');
    const singleResultContainer = document.getElementById('singleResultContainer');
    const authStatusBadge = document.getElementById('authStatusBadge');

    // Batch Check Elements
    const batchTextarea = document.getElementById('batchTextarea');
    const batchTotalCount = document.getElementById('batchTotalCount');
    const btnClearBatch = document.getElementById('btnClearBatch');
    const btnStartBatch = document.getElementById('btnStartBatch');
    const btnStopBatch = document.getElementById('btnStopBatch');
    const btnImportFile = document.getElementById('btnImportFile');
    const batchFileInput = document.getElementById('batchFileInput');
    const batchProgressWrapper = document.getElementById('batchProgressWrapper');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const batchStatsBar = document.getElementById('batchStatsBar');
    const statExist = document.getElementById('statExist');
    const statNotExist = document.getElementById('statNotExist');
    const statError = document.getElementById('statError');
    const batchTableWrapper = document.getElementById('batchTableWrapper');
    const batchTableBody = document.getElementById('batchTableBody');
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnOpenFullTab = document.getElementById('btnOpenFullTab');
    const btnOpenSidePanel = document.getElementById('btnOpenSidePanel');

    if (btnOpenSidePanel) {
        btnOpenSidePanel.addEventListener('click', async () => {
            if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
                try {
                    const win = await chrome.windows.getCurrent();
                    await chrome.sidePanel.open({ windowId: win.id });
                    window.close();
                } catch (err) {
                    console.warn("sidePanel.open error, fallback to tab:", err);
                    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
                }
            } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
                chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
            } else {
                window.open(window.location.href, '_blank');
            }
        });
    }

    if (btnOpenFullTab) {
        btnOpenFullTab.addEventListener('click', () => {
            if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
                chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
            } else {
                window.open(window.location.href, '_blank');
            }
        });
    }

    const btnOpenFloatingWindow = document.getElementById('btnOpenFloatingWindow');
    if (btnOpenFloatingWindow) {
        btnOpenFloatingWindow.addEventListener('click', () => {
            if (typeof chrome !== 'undefined' && chrome.windows && chrome.windows.create) {
                chrome.windows.create({
                    url: chrome.runtime.getURL('popup/popup.html'),
                    type: 'popup',
                    width: 580,
                    height: 740,
                    top: 80,
                    left: 80,
                    focused: true
                });
            } else {
                window.open(window.location.href, '_blank', 'width=580,height=740,left=80,top=80');
            }
        });
    }

    let batchQueue = [];
    let batchResults = [];
    let isRunningBatch = false;
    let shouldStopBatch = false;

    // --- Tab Switch Logic ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) targetContent.classList.add('active');
            triggerAutoSave();
        });
    });

    // --- Helper cập nhật Badge trạng thái kết nối ---
    function updateAuthStatus(isLoggedIn, message) {
        if (!authStatusBadge) return;
        const dot = authStatusBadge.querySelector('.status-dot');
        const text = authStatusBadge.querySelector('.status-text');

        if (isLoggedIn) {
            dot.style.background = 'var(--success)';
            text.textContent = 'Đã kết nối';
        } else {
            dot.style.background = 'var(--danger)';
            text.textContent = message || 'Chưa đăng nhập';
        }
    }

    // --- Single Check Logic ---
    async function handleSingleCheck() {
        const code = singleInput.value.trim();
        if (!code) {
            singleInput.focus();
            return;
        }

        const btnText = btnSingleCheck.querySelector('.btn-text');
        const btnSpinner = btnSingleCheck.querySelector('.btn-spinner');
        btnText.style.display = 'none';
        btnSpinner.style.display = 'inline';
        btnSingleCheck.disabled = true;

        singleResultContainer.style.display = 'block';
        singleResultContainer.innerHTML = '<div style="color:#64748b;font-size:12px;text-align:center;">🔍 Đang tra cứu trên hệ thống...</div>';

        const result = await VinasynetChecker.checkCode(code);

        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
        btnSingleCheck.disabled = false;

        if (result.isUnauthorized) {
            updateAuthStatus(false, 'Chưa đăng nhập');
            singleResultContainer.innerHTML = `
                <div class="result-badge error">⚠️ Chưa đăng nhập hệ thống</div>
                <div class="result-detail-item">Bạn cần đăng nhập vào trang quản lý hồ sơ trước khi dùng tiện ích.</div>
                <a href="http://ktdl.soxaydung.hungyen.gov.vn/" target="_blank" class="result-link">👉 Mở trang đăng nhập</a>
            `;
            return;
        }

        updateAuthStatus(true);

        if (result.error) {
            singleResultContainer.innerHTML = `
                <div class="result-badge error">⚠️ Lỗi: ${result.error}</div>
            `;
            return;
        }

        if (result.exists) {
            const first = result.foundItems[0];
            const count = result.foundItems.length;
            const hasMultiple = count > 1;
            const dup = result.duplicateAnalysis || {};

            let duplicateHtml = '';
            if (hasMultiple) {
                // Hiển thị phần phân tích trùng lặp
                const sameTags = (dup.sameFields || []).map(f => `<span class="duplicate-tag same">✓ Trùng ${f}</span>`).join('');
                const diffTags = (dup.diffFields || []).map(f => `<span class="duplicate-tag diff">✗ Khác ${f}</span>`).join('');

                // Danh sách từng hồ sơ để người dùng xem trực quan
                const itemsListHtml = result.foundItems.map((item, idx) => `
                    <div class="duplicate-item-card">
                        <div class="duplicate-item-header">
                            <span>Hồ sơ #${idx + 1} ${item.exactMatch ? '⭐ (Khớp chính xác)' : ''}</span>
                            ${item.detailUrl ? `<a href="${item.detailUrl}" target="_blank" class="result-link" style="margin-top:0;font-size:11px;">🔗 Mở</a>` : ''}
                        </div>
                        <div style="margin-bottom:2px;"><b>Ký hiệu:</b> <span style="color:#0369a1;">${item.symbol || 'N/A'}</span></div>
                        <div style="margin-bottom:2px;"><b>Mã hệ thống:</b> ${item.sysCode || 'N/A'}</div>
                        <div style="margin-bottom:2px;"><b>Năm:</b> ${item.year || 'N/A'} ${item.thbq ? `| <b>THBQ:</b> ${item.thbq}` : ''}</div>
                        <div style="margin-top:4px;color:#334155;line-height:1.3;"><b>Tiêu đề:</b> ${item.title || 'N/A'}</div>
                    </div>
                `).join('');

                duplicateHtml = `
                    <div class="duplicate-analysis-card">
                        <div class="duplicate-title">⚠️ ĐỐI CHIẾU ${count} HỒ SƠ TÌM THẤY:</div>
                        <div style="font-size:12px;color:#92400e;font-weight:600;margin-bottom:4px;">
                            👉 Kết luận: ${dup.summary}
                        </div>
                        <div class="duplicate-field-list">
                            ${sameTags}
                            ${diffTags}
                        </div>
                        <div class="duplicate-items-list">
                            ${itemsListHtml}
                        </div>
                    </div>
                `;
            }

            singleResultContainer.innerHTML = `
                <div class="result-badge ${hasMultiple ? 'duplicate' : 'exist'}">
                    ${hasMultiple ? `⚠️ TÌM THẤY ${count} HỒ SƠ TRÙNG MÃ` : '✅ ĐÃ TỒN TẠI TRÊN HỆ THỐNG'}
                </div>
                ${!hasMultiple ? `
                    <div class="result-detail-item"><b>Ký hiệu:</b> ${first.symbol || 'N/A'}</div>
                    <div class="result-detail-item"><b>Mã hệ thống:</b> ${first.sysCode || 'N/A'}</div>
                    <div class="result-detail-item"><b>Năm:</b> ${first.year || 'N/A'} ${first.thbq ? `(THBQ: ${first.thbq})` : ''}</div>
                    <div class="result-detail-item"><b>Tiêu đề:</b> ${first.title || 'N/A'}</div>
                    ${first.detailUrl ? `<a href="${first.detailUrl}" target="_blank" class="result-link">🔗 Mở chi tiết hồ sơ này</a>` : ''}
                ` : duplicateHtml}
            `;
        } else {
            singleResultContainer.innerHTML = `
                <div class="result-badge not-exist">❌ CHƯA TỒN TẠI TRÊN HỆ THỐNG</div>
                <div class="result-detail-item">Không tìm thấy hồ sơ nào có ký hiệu hoặc mã khớp với: <b>${result.code}</b></div>
            `;
        }
    }

    btnSingleCheck.addEventListener('click', handleSingleCheck);
    singleInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSingleCheck();
        }
    });
    if (singleInput) {
        singleInput.addEventListener('input', triggerAutoSave);
    }

    // --- Batch Check Logic ---
    function updateBatchCount() {
        const text = batchTextarea.value;
        const codes = MiniExcel.parseTextLines(text);
        batchTotalCount.textContent = codes.length;
    }

    batchTextarea.addEventListener('input', () => {
        updateBatchCount();
        triggerAutoSave();
    });

    btnClearBatch.addEventListener('click', () => {
        if (isRunningBatch) return;
        batchTextarea.value = '';
        updateBatchCount();
        batchTableBody.innerHTML = '';
        batchTableWrapper.style.display = 'none';
        batchStatsBar.style.display = 'none';
        batchProgressWrapper.style.display = 'none';
        batchResults = [];
        triggerAutoSave();
    });

    // Import file txt/csv
    btnImportFile.addEventListener('click', () => {
        batchFileInput.value = null;
        batchFileInput.click();
    });

    batchFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const content = event.target.result;
            const parsedCodes = MiniExcel.parseTextLines(content);
            if (parsedCodes.length > 0) {
                batchTextarea.value = parsedCodes.join('\n');
                updateBatchCount();
                triggerAutoSave();
            } else {
                alert('Không tìm thấy mã hợp lệ trong file đã chọn!');
            }
        };
        reader.readAsText(file, 'utf-8');
    });

    btnStopBatch.addEventListener('click', () => {
        shouldStopBatch = true;
        btnStopBatch.textContent = 'Đang dừng...';
        btnStopBatch.disabled = true;
    });

    // Bắt đầu chạy Batch
    btnStartBatch.addEventListener('click', async () => {
        if (isRunningBatch) return;

        const rawCodes = MiniExcel.parseTextLines(batchTextarea.value);
        if (rawCodes.length === 0) {
            alert('Vui lòng dán danh sách mã cần kiểm tra!');
            batchTextarea.focus();
            return;
        }

        // Setup trạng thái
        isRunningBatch = true;
        shouldStopBatch = false;
        btnStartBatch.disabled = true;
        btnClearBatch.disabled = true;
        btnImportFile.disabled = true;
        btnStopBatch.disabled = false;
        btnStopBatch.textContent = 'Dừng lại';

        batchProgressWrapper.style.display = 'block';
        batchStatsBar.style.display = 'flex';
        batchTableWrapper.style.display = 'block';

        batchTableBody.innerHTML = '';
        batchResults = [];

        let countExist = 0;
        let countNotExist = 0;
        let countError = 0;

        statExist.textContent = '0';
        statNotExist.textContent = '0';
        statError.textContent = '0';

        const total = rawCodes.length;

        // Render trước các dòng vào bảng với trạng thái chờ
        rawCodes.forEach((c, idx) => {
            const tr = document.createElement('tr');
            tr.id = `batchRow_${idx}`;
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td style="font-weight:600;">${c}</td>
                <td><span class="badge-status badge-loading">Đang chờ...</span></td>
                <td class="table-title-cell">-</td>
                <td>-</td>
            `;
            batchTableBody.appendChild(tr);
        });

        // Bắt đầu quét tuần tự
        for (let i = 0; i < total; i++) {
            if (shouldStopBatch) {
                break;
            }

            const code = rawCodes[i];
            const row = document.getElementById(`batchRow_${i}`);
            
            // Đánh dấu dòng đang kiểm tra
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                const badge = row.querySelector('.badge-status');
                if (badge) {
                    badge.textContent = 'Đang kiểm tra...';
                    badge.style.background = '#e0f2fe';
                    badge.style.color = '#0284c7';
                }
            }

            // Gọi tra cứu
            const res = await VinasynetChecker.checkCode(code);
            batchResults.push(res);

            // Cập nhật kết quả lên dòng
            if (row) {
                const statusCell = row.querySelector('td:nth-child(3)');
                const titleCell = row.querySelector('td:nth-child(4)');
                const linkCell = row.querySelector('td:nth-child(5)');

                if (res.isUnauthorized) {
                    updateAuthStatus(false, 'Chưa đăng nhập');
                    statusCell.innerHTML = '<span class="badge-status badge-not-exist">Chưa login</span>';
                    titleCell.textContent = 'Vui lòng đăng nhập hệ thống';
                    countError++;
                } else if (res.error) {
                    statusCell.innerHTML = '<span class="badge-status badge-not-exist">Lỗi</span>';
                    titleCell.textContent = res.error;
                    countError++;
                } else if (res.exists) {
                    countExist++;
                    const first = res.foundItems[0];
                    const count = res.totalFound || res.foundItems.length;
                    const dup = res.duplicateAnalysis || {};

                    if (count > 1) {
                        statusCell.innerHTML = `<span class="badge-status badge-duplicate">Trùng ${count} HS</span>`;
                        
                        const itemsDetailHtml = res.foundItems.map((it, idx) => `
                            <div class="batch-sub-item">
                                <span class="sub-idx">#${idx + 1}</span> 
                                ${it.symbol ? `<span class="sub-symbol">[${it.symbol}]</span>` : ''}
                                ${it.sysCode ? `<span class="sub-syscode">(Mã: ${it.sysCode})</span>` : ''}
                                <span class="sub-title">${it.title || ''}</span>
                                <span class="sub-meta">${it.year ? `[Năm ${it.year}]` : ''} ${it.thbq ? `(THBQ: ${it.thbq})` : ''}</span>
                            </div>
                        `).join('');

                        titleCell.innerHTML = `
                            <div class="batch-dup-summary">⚠️ ${dup.summary || `Trùng ${count} hồ sơ`}</div>
                            <div class="batch-items-detail-list">${itemsDetailHtml}</div>
                        `;
                        
                        const linksHtml = res.foundItems.map((it, idx) => 
                            it.detailUrl ? `<a href="${it.detailUrl}" target="_blank" class="batch-sub-link">🔗 HS${idx + 1}</a>` : ''
                        ).filter(Boolean).join(' ');
                        
                        linkCell.innerHTML = linksHtml || '-';
                    } else {
                        statusCell.innerHTML = '<span class="badge-status badge-exist">Đã tồn tại</span>';
                        titleCell.innerHTML = `<div>${first.symbol ? `<b style="color:#0369a1;">[${first.symbol}]</b> ` : ''}${first.title || ''} ${first.year ? `<span style="color:#64748b;">(${first.year})</span>` : ''}</div>`;
                        titleCell.title = first.title || '';

                        if (first.detailUrl) {
                            linkCell.innerHTML = `<a href="${first.detailUrl}" target="_blank">🔗 Xem</a>`;
                        } else {
                            linkCell.innerHTML = '-';
                        }
                    }
                } else {
                    countNotExist++;
                    statusCell.innerHTML = '<span class="badge-status badge-not-exist">Chưa có</span>';
                    titleCell.textContent = 'Không tìm thấy hồ sơ';
                }
            }

            // Cập nhật thống kê và progress bar
            statExist.textContent = countExist;
            statNotExist.textContent = countNotExist;
            statError.textContent = countError;

            const completed = i + 1;
            const percent = Math.round((completed / total) * 100);
            progressBarFill.style.width = `${percent}%`;
            progressPercent.textContent = `${percent}%`;
            progressText.textContent = `Đang kiểm tra: ${completed}/${total}`;
            document.title = `⏳ (${completed}/${total}) Đang quét... - Tra Cứu Hồ Sơ`;

            // Tự động lưu tiến độ định kỳ
            if (completed % 5 === 0 || completed === total) {
                triggerAutoSave();
            }

            // Thêm delay nhỏ ~120ms để không gây nghẽn web server
            if (i < total - 1 && !shouldStopBatch) {
                await new Promise(r => setTimeout(r, 120));
            }
        }

        // Hoàn tất
        isRunningBatch = false;
        btnStartBatch.disabled = false;
        btnClearBatch.disabled = false;
        btnImportFile.disabled = false;
        btnStopBatch.disabled = true;

        if (shouldStopBatch) {
            progressText.textContent = `Đã dừng: ${batchResults.length}/${total}`;
            document.title = `⏸️ Đã dừng (${batchResults.length}/${total}) - Tra Cứu Hồ Sơ`;
        } else {
            progressText.textContent = `Hoàn tất kiểm tra (${total}/${total})`;
            document.title = `✅ Hoàn tất (${total}/${total}) - Tra Cứu Hồ Sơ`;
        }
        triggerAutoSave();
    });

    // Xuất CSV / Excel
    btnExportCSV.addEventListener('click', () => {
        if (batchResults.length === 0) {
            alert('Chưa có kết quả để xuất file!');
            return;
        }
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        MiniExcel.exportResultsToCSV(batchResults, `Ket_qua_kiem_tra_ho_so_${dateStr}.csv`);
    });

    // --- Batch Delete Logic ---
    const deleteTextarea = document.getElementById('deleteTextarea');
    const deleteTotalCount = document.getElementById('deleteTotalCount');
    const btnClearDelete = document.getElementById('btnClearDelete');
    const btnStartDelete = document.getElementById('btnStartDelete');
    const btnStopDelete = document.getElementById('btnStopDelete');
    const btnImportDeleteFile = document.getElementById('btnImportDeleteFile');
    const deleteFileInput = document.getElementById('deleteFileInput');
    const deleteProgressWrapper = document.getElementById('deleteProgressWrapper');
    const deleteProgressBarFill = document.getElementById('deleteProgressBarFill');
    const deleteProgressText = document.getElementById('deleteProgressText');
    const deleteProgressPercent = document.getElementById('deleteProgressPercent');
    const deleteStatsBar = document.getElementById('deleteStatsBar');
    const statKept = document.getElementById('statKept');
    const statDeleted = document.getElementById('statDeleted');
    const statDeleteSkipped = document.getElementById('statDeleteSkipped');
    const deleteTableWrapper = document.getElementById('deleteTableWrapper');
    const deleteTableBody = document.getElementById('deleteTableBody');
    const btnExportDeleteCSV = document.getElementById('btnExportDeleteCSV');

    let deleteResults = [];
    let isRunningDelete = false;
    let shouldStopDelete = false;

    function updateDeleteCount() {
        if (!deleteTextarea || !deleteTotalCount) return;
        const text = deleteTextarea.value;
        const codes = MiniExcel.parseTextLines(text);
        deleteTotalCount.textContent = codes.length;
    }

    if (deleteTextarea) {
        deleteTextarea.addEventListener('input', () => {
            updateDeleteCount();
            triggerAutoSave();
        });
    }

    if (btnClearDelete) {
        btnClearDelete.addEventListener('click', () => {
            if (isRunningDelete) return;
            deleteTextarea.value = '';
            updateDeleteCount();
            if (deleteTableBody) deleteTableBody.innerHTML = '';
            if (deleteTableWrapper) deleteTableWrapper.style.display = 'none';
            if (deleteStatsBar) deleteStatsBar.style.display = 'none';
            if (deleteProgressWrapper) deleteProgressWrapper.style.display = 'none';
            deleteResults = [];
            triggerAutoSave();
        });
    }

    if (btnImportDeleteFile && deleteFileInput) {
        btnImportDeleteFile.addEventListener('click', () => {
            deleteFileInput.value = null;
            deleteFileInput.click();
        });

        deleteFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                const content = event.target.result;
                const parsedCodes = MiniExcel.parseTextLines(content);
                if (parsedCodes.length > 0) {
                    deleteTextarea.value = parsedCodes.join('\n');
                    updateDeleteCount();
                    triggerAutoSave();
                } else {
                    alert('Không tìm thấy mã hợp lệ trong file đã chọn!');
                }
            };
            reader.readAsText(file, 'utf-8');
        });
    }

    if (btnStopDelete) {
        btnStopDelete.addEventListener('click', async () => {
            shouldStopDelete = true;
            btnStopDelete.textContent = 'Đang dừng...';
            btnStopDelete.disabled = true;

            // Kích hoạt dừng luồng tự động ở Tab Quy trình các bước
            if (btnAutoDeleteStop) {
                btnAutoDeleteStop.click();
            }

            // Ghi tín hiệu ngắt khẩn cấp vào chrome.storage.local
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    await chrome.storage.local.set({
                        vsn_auto_flow: { isRunning: false, forceStopped: true, stoppedAt: Date.now() }
                    });
                } catch (e) {}
            }

            await sendMessageToActiveTab({ action: 'STOP_AUTO_FLOW' });
            setTimeout(() => {
                btnStopDelete.textContent = 'Dừng lại';
                btnStopDelete.disabled = false;
            }, 800);
        });
    }

    // Bắt đầu chạy Xóa trùng: Luôn chạy Quy trình 5 bước thật trên Web!
    if (btnStartDelete) {
        btnStartDelete.addEventListener('click', async () => {
            const rawCodes = MiniExcel.parseTextLines(deleteTextarea.value);
            if (rawCodes.length === 0) {
                alert('Vui lòng dán danh sách mã cần xóa trùng!');
                deleteTextarea.focus();
                return;
            }

            // Đồng bộ sang Tab Quy Trình Các Bước
            if (stepsTextarea) {
                stepsTextarea.value = rawCodes.join('\n');
                updateStepsCodeView();
            }

            const tabBtnSteps = document.getElementById('tabBtnSteps');
            if (tabBtnSteps) {
                tabBtnSteps.click();
            }

            addStepsLog(`🚀 Đã chuyển ${rawCodes.length} mã sang Quy trình 5 bước thực tế trên Web!`, 'info');

            // Kích hoạt tự động xóa
            if (btnAutoDeleteRun) {
                setTimeout(() => {
                    btnAutoDeleteRun.click();
                }, 300);
            }
        });
    }

    // Export CSV Delete Log
    if (btnExportDeleteCSV) {
        btnExportDeleteCSV.addEventListener('click', () => {
            if (deleteResults.length === 0) {
                alert('Chưa có kết quả để xuất file!');
                return;
            }
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
            MiniExcel.exportDeleteResultsToCSV(deleteResults, `Bao_cao_xoa_trung_ho_so_${dateStr}.csv`);
        });
    }

    // --- 7 Steps Interactive Logic ---
    const stepsTextarea = document.getElementById('stepsTextarea');
    const btnImportStepsFile = document.getElementById('btnImportStepsFile');
    const stepsFileInput = document.getElementById('stepsFileInput');
    const btnPasteStepsList = document.getElementById('btnPasteStepsList');
    const btnClearStepsList = document.getElementById('btnClearStepsList');
    const btnCopyCurrentStepCode = document.getElementById('btnCopyCurrentStepCode');
    const stepsCurrentIndex = document.getElementById('stepsCurrentIndex');
    const stepsTotalCount = document.getElementById('stepsTotalCount');
    const btnPrevCode = document.getElementById('btnPrevCode');
    const btnNextCode = document.getElementById('btnNextCode');
    const stepsCurrentCodeDisplay = document.getElementById('stepsCurrentCodeDisplay');
    const stepsCurrentStatusDisplay = document.getElementById('stepsCurrentStatusDisplay');
    const btnStep1 = document.getElementById('btnStep1');
    const btnStep2 = document.getElementById('btnStep2');
    const btnStep3 = document.getElementById('btnStep3');
    const btnStep4 = document.getElementById('btnStep4');
    const btnStep5 = document.getElementById('btnStep5');
    const btnAutoDeleteRun = document.getElementById('btnAutoDeleteRun');
    const btnAutoDeleteStop = document.getElementById('btnAutoDeleteStop');
    const stepsAutoProgressBox = document.getElementById('stepsAutoProgressBox');
    const stepsAutoProgressText = document.getElementById('stepsAutoProgressText');
    const stepsAutoProgressPercent = document.getElementById('stepsAutoProgressPercent');
    const stepsAutoProgressBarFill = document.getElementById('stepsAutoProgressBarFill');
    // Các phần tử Bảng Kết Quả & Xuất CSV mới
    const stepsTableBody = document.getElementById('stepsTableBody');
    const stepsResultBadge = document.getElementById('stepsResultBadge');
    const btnExportStepsCSV = document.getElementById('btnExportStepsCSV');
    const btnClearStepsTable = document.getElementById('btnClearStepsTable');
    const btnTopExportCSV = document.getElementById('btnTopExportCSV');
    const chkSpotCheck10 = document.getElementById('chkSpotCheck10');
    const btnExportChecklistCSV = document.getElementById('btnExportChecklistCSV');
    const btnTopExportChecklist = document.getElementById('btnTopExportChecklist');
    const btnExportChecklistSteps = document.getElementById('btnExportChecklistSteps');

    let stepsCodesList = [];
    let currentStepCodeIndex = 0;
    let isRunningAuto7Steps = false;
    let shouldStop7Steps = false;
    let currentStepScanResult = null;
    let stepsProcessedMap = {};
    let stepsTableRecords = [];

    // Nạp dữ liệu bảng kết quả từ storage
    function loadStepsTableData() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['vsn_steps_table_records'], (res) => {
                if (res && res.vsn_steps_table_records && Array.isArray(res.vsn_steps_table_records)) {
                    stepsTableRecords = res.vsn_steps_table_records;
                } else {
                    stepsTableRecords = [];
                }
                renderStepsTable();
            });
        }
    }

    function saveStepsTableData() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ vsn_steps_table_records: stepsTableRecords });
        }
    }

    function addOrUpdateStepsRow(code, scanResText, keptText, actionNote, statusType = 'info') {
        if (!code) return;
        const nowStr = new Date().toLocaleTimeString('vi-VN');
        const existingIdx = stepsTableRecords.findIndex(r => r.code === code);

        if (existingIdx >= 0) {
            if (scanResText) stepsTableRecords[existingIdx].scanResText = scanResText;
            if (keptText) stepsTableRecords[existingIdx].keptText = keptText;
            if (actionNote) stepsTableRecords[existingIdx].actionNote = actionNote;
            if (statusType) stepsTableRecords[existingIdx].statusType = statusType;
            stepsTableRecords[existingIdx].time = nowStr;
        } else {
            stepsTableRecords.push({
                code: code,
                scanResText: scanResText || 'Đang xử lý...',
                keptText: keptText || '-',
                actionNote: actionNote || 'Đang thực hiện...',
                statusType: statusType || 'info',
                time: nowStr
            });
        }
        renderStepsTable();
        saveStepsTableData();
    }

    function renderStepsTable() {
        if (!stepsTableBody) return;
        if (stepsTableRecords.length === 0) {
            stepsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:12px;">Chưa có dữ liệu xử lý. Nhấp các bước hoặc bấm Chạy tự động để ghi nhận kết quả.</td></tr>';
            if (stepsResultBadge) stepsResultBadge.textContent = '0 bản ghi';
            return;
        }

        let html = '';
        stepsTableRecords.forEach((item, idx) => {
            let badgeClass = 'badge-match';
            if (item.statusType === 'warning') badgeClass = 'badge-dup';
            else if (item.statusType === 'danger') badgeClass = 'badge-error';
            else if (item.statusType === 'success') badgeClass = 'badge-zero';

            let scanDisplay = item.scanResText || '-';
            let noteDisplay = item.actionNote || '-';
            if (item.statusType === 'success' && scanDisplay.includes('Đang lọc')) {
                scanDisplay = '1 bản (CLEAN_OK)';
                if (noteDisplay.includes('Đang điền mã') || noteDisplay.includes('Đang xử lý')) {
                    noteDisplay = 'Đạt chuẩn (1 bản duy nhất) - Hồ sơ chuẩn, không có bản trùng thừa';
                }
            }

            html += `<tr>
                <td style="text-align:center; font-weight:700;">${idx + 1}</td>
                <td style="font-family:monospace; font-weight:700; color:#4f46e5;">${item.code}</td>
                <td><span class="badge ${badgeClass}">${scanDisplay}</span></td>
                <td style="font-size:11px;">${item.keptText || '-'}</td>
                <td style="font-size:11px; font-weight:600;">${noteDisplay}</td>
            </tr>`;
        });

        stepsTableBody.innerHTML = html;
        if (stepsResultBadge) stepsResultBadge.textContent = `${stepsTableRecords.length} bản ghi`;
    }

    function exportStepsTableToCSV() {
        if (stepsTableRecords.length === 0) {
            alert('Chưa có kết quả xử lý nào trên bảng để xuất CSV!');
            return;
        }

        let csvContent = '\uFEFF'; // BOM UTF-8
        csvContent += 'STT,Mã hồ sơ,Kết quả Scan (B2),Bản ghi Giữ lại (#1),Ghi chú / Kết quả thao tác,Thời gian\n';

        stepsTableRecords.forEach((item, idx) => {
            const cleanCode = `"${(item.code || '').replace(/"/g, '""')}"`;
            let scanText = item.scanResText || '-';
            let noteText = item.actionNote || '-';
            if (item.statusType === 'success' && scanText.includes('Đang lọc')) {
                scanText = '1 bản (CLEAN_OK)';
                if (noteText.includes('Đang điền mã') || noteText.includes('Đang xử lý')) {
                    noteText = 'Đạt chuẩn (1 bản duy nhất) - Hồ sơ chuẩn, không có bản trùng thừa';
                }
            }
            const cleanScan = `"${scanText.replace(/"/g, '""')}"`;
            const cleanKept = `"${(item.keptText || '').replace(/"/g, '""')}"`;
            const cleanNote = `"${noteText.replace(/"/g, '""')}"`;
            const time = `"${item.time || ''}"`;
            csvContent += `${idx + 1},${cleanCode},${cleanScan},${cleanKept},${cleanNote},${time}\n`;
        });

        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const filename = `Bao_cao_xu_ly_quy_trinh_xoa_${dateStr}.csv`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addStepsLog(`📥 Đã tải thành công file CSV: "${filename}" (${stepsTableRecords.length} bản ghi)!`, 'success');
    }

    if (btnExportStepsCSV) btnExportStepsCSV.addEventListener('click', exportStepsTableToCSV);
    if (btnTopExportCSV) btnTopExportCSV.addEventListener('click', exportStepsTableToCSV);

    // Xử lý cài đặt và sự kiện Process Checklist (4 nhóm trạng thái & Kiểm chứng 10%)
    if (chkSpotCheck10 && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['vsn_spot_check_10'], (res) => {
            if (res && res.vsn_spot_check_10 !== undefined) {
                chkSpotCheck10.checked = !!res.vsn_spot_check_10;
            } else {
                chkSpotCheck10.checked = true;
            }
        });
        chkSpotCheck10.addEventListener('change', () => {
            chrome.storage.local.set({ vsn_spot_check_10: chkSpotCheck10.checked });
            addStepsLog(`🎲 Đã ${chkSpotCheck10.checked ? 'BẬT' : 'TẮT'} kiểm chứng ngẫu nhiên 10% mã đã HOÀN THÀNH.`, 'info');
        });
    }

    async function exportChecklistToCSV() {
        let checklist = {};
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const data = await new Promise(r => chrome.storage.local.get(['vsn_process_checklist'], r));
            checklist = data && data.vsn_process_checklist ? data.vsn_process_checklist : {};
        }

        if (Object.keys(checklist).length === 0 && typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                const resp = await fetch(chrome.runtime.getURL('process_checklist_seed.json'));
                checklist = await resp.json();
                chrome.storage.local.set({ vsn_process_checklist: checklist });
            } catch (e) {}
        }

        const codes = Object.keys(checklist);
        if (codes.length === 0) {
            alert('Chưa có dữ liệu Process Checklist để xuất file!');
            return;
        }

        let csvContent = '\uFEFF';
        csvContent += 'STT,Mã hồ sơ,Nhóm trạng thái,Chi tiết trạng thái,Số bản ghi,Kiểm chứng 10%,Bản ghi giữ lại / Tiêu đề,Thời gian cập nhật\n';

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

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addStepsLog(`📋 Đã tải thành công file Checklist: "${filename}" (${codes.length} mã)!`, 'success');
    }

    if (btnExportChecklistCSV) btnExportChecklistCSV.addEventListener('click', exportChecklistToCSV);
    if (btnTopExportChecklist) btnTopExportChecklist.addEventListener('click', exportChecklistToCSV);
    if (btnExportChecklistSteps) btnExportChecklistSteps.addEventListener('click', exportChecklistToCSV);

    if (btnClearStepsTable) {
        btnClearStepsTable.addEventListener('click', () => {
            if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ kết quả trên bảng và làm mới bộ nhớ?')) return;
            stepsTableRecords = [];
            renderStepsTable();
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove(['vsn_steps_table_records', 'vsn_audit_records', 'vsn_tab_audit_log', 'vsn_global_audit_log']);
            }
            addStepsLog('🗑️ Đã xóa sạch vĩnh viễn dữ liệu bảng kết quả và bộ nhớ audit.', 'info');
        });
    }

    // Tự động dọn dẹp bộ nhớ đệm lịch sử cũ (2978 bản ghi tích lũy trước đây) khi cập nhật lên v1.1.29
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['vsn_clean_v1129', 'vsn_saved_logs', 'vsn_steps_table_records', 'vsn_auto_flow'], (d) => {
            if (!d || !d.vsn_clean_v1129) {
                chrome.storage.local.remove(['vsn_steps_table_records', 'vsn_audit_records', 'vsn_tab_audit_log', 'vsn_global_audit_log', 'vsn_saved_logs'], () => {
                    chrome.storage.local.set({ vsn_clean_v1129: true });
                    stepsTableRecords = [];
                    renderStepsTable();
                });
            } else {
                if (d.vsn_steps_table_records && Array.isArray(d.vsn_steps_table_records)) {
                    stepsTableRecords = d.vsn_steps_table_records;
                    renderStepsTable();
                } else {
                    loadStepsTableData();
                }

                if (d.vsn_saved_logs && Array.isArray(d.vsn_saved_logs) && d.vsn_saved_logs.length > 0) {
                    if (stepsLogBox) {
                        stepsLogBox.innerHTML = '';
                        d.vsn_saved_logs.slice(-100).forEach(l => {
                            const line = document.createElement('div');
                            line.className = `steps-log-line ${l.type || 'info'}`;
                            line.textContent = `[${l.time}] ${l.msg}`;
                            stepsLogBox.appendChild(line);
                        });
                        stepsLogBox.scrollTop = stepsLogBox.scrollHeight;
                    }
                }

                if (d.vsn_auto_flow && d.vsn_auto_flow.isRunning) {
                    const flow = d.vsn_auto_flow;
                    const curTextCodes = stepsTextarea ? MiniExcel.parseTextLines(stepsTextarea.value) : [];
                    if (curTextCodes.length > 0 && flow.codes && flow.codes.length !== curTextCodes.length) {
                        chrome.storage.local.remove(['vsn_auto_flow']);
                        if (btnAutoDeleteRun) btnAutoDeleteRun.disabled = false;
                        if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = true;
                        if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'none';
                    } else {
                        if (btnAutoDeleteRun) btnAutoDeleteRun.disabled = true;
                        if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = false;
                        if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'block';
                        const total = (flow.codes && flow.codes.length) || 0;
                        const cur = flow.currentIndex || 0;
                        const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
                        const curCode = (flow.codes && flow.codes[cur]) || '';
                        if (stepsAutoProgressText) stepsAutoProgressText.textContent = `Đang xử lý mã ${cur + 1}/${total} (${curCode})`;
                        if (stepsAutoProgressPercent) stepsAutoProgressPercent.textContent = `${pct}%`;
                        if (stepsAutoProgressBarFill) stepsAutoProgressBarFill.style.width = `${pct}%`;
                        highlightPopupStep(flow.currentStep || 1);
                    }
                } else {
                    if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'none';
                    if (btnAutoDeleteRun) btnAutoDeleteRun.disabled = false;
                    if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = true;
                }
            }
        });
    } else {
        loadStepsTableData();
    }

    function addStepsLog(msg, type = 'info') {
        if (!stepsLogBox) return;
        const placeholder = stepsLogBox.querySelector('.steps-log-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        const line = document.createElement('div');
        line.className = `steps-log-line ${type}`;
        const time = new Date().toLocaleTimeString('vi-VN');
        line.textContent = `[${time}] ${msg}`;
        stepsLogBox.appendChild(line);
        // Tự động cuộn xuống dưới cùng để luôn thấy log mới nhất
        stepsLogBox.scrollTop = stepsLogBox.scrollHeight;
    }

    let lastLoggedCount = -1;
    function updateStepsCodeView(fromUserInput = false) {
        if (!stepsTextarea) return;
        stepsCodesList = MiniExcel.parseTextLines(stepsTextarea.value);
        if (stepsTotalCount) stepsTotalCount.textContent = stepsCodesList.length;

        if (fromUserInput && stepsCodesList.length !== lastLoggedCount) {
            lastLoggedCount = stepsCodesList.length;
            if (stepsCodesList.length > 0) {
                resetPopupTableAndLogsForNewList(stepsCodesList.length);
            }
        }

        if (stepsCodesList.length === 0) {
            currentStepCodeIndex = 0;
            if (stepsCurrentIndex) stepsCurrentIndex.textContent = '0';
            if (stepsCurrentCodeDisplay) stepsCurrentCodeDisplay.textContent = 'Chưa có mã';
            if (stepsCurrentStatusDisplay) stepsCurrentStatusDisplay.textContent = 'Trạng thái: Vui lòng dán danh sách mã';
            return;
        }

        if (currentStepCodeIndex >= stepsCodesList.length) {
            currentStepCodeIndex = stepsCodesList.length - 1;
        }
        if (currentStepCodeIndex < 0) currentStepCodeIndex = 0;

        if (stepsCurrentIndex) stepsCurrentIndex.textContent = currentStepCodeIndex + 1;
        const currentCode = stepsCodesList[currentStepCodeIndex];
        if (stepsCurrentCodeDisplay) stepsCurrentCodeDisplay.textContent = currentCode;

        const info = stepsProcessedMap[currentCode];
        if (info) {
            if (stepsCurrentStatusDisplay) stepsCurrentStatusDisplay.textContent = `Trạng thái: ${info.statusText}`;
        } else {
            if (stepsCurrentStatusDisplay) stepsCurrentStatusDisplay.textContent = `Trạng thái: Mã mới (${currentStepCodeIndex + 1}/${stepsCodesList.length})`;
        }
    }

    function resetPopupTableAndLogsForNewList(count) {
        // 1. Reset bảng kết quả và xóa vĩnh viễn trong chrome.storage
        stepsTableRecords = [];
        renderStepsTable();
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove([
                'vsn_steps_table_records', 
                'vsn_audit_records', 
                'vsn_tab_audit_log', 
                'vsn_global_audit_log',
                'vsn_auto_flow',
                'vsn_saved_logs'
            ]);
        }

        // 2. Reset logs
        if (stepsLogBox) {
            stepsLogBox.innerHTML = '';
        }

        // 3. Reset các index
        currentStepCodeIndex = 0;
        stepsProcessedMap = {};

        // 4. RESET KHUNG TIẾN ĐỘ PROGRESS BOX & CẬP NHẬT TỔNG MÃ MỚI
        if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'none';
        if (stepsAutoProgressText) stepsAutoProgressText.textContent = `Sẵn sàng: 0/${count} mã`;
        if (stepsAutoProgressPercent) stepsAutoProgressPercent.textContent = '0%';
        if (stepsAutoProgressBarFill) stepsAutoProgressBarFill.style.width = '0%';
        if (btnAutoDeleteRun) btnAutoDeleteRun.disabled = false;
        if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = true;
        highlightPopupStep(0);
        lastLoggedStep = 0;
        lastLoggedCode = '';

        // Dừng tiến trình cũ nếu còn chạy ngầm trên tab web
        try {
            sendMessageToActiveTab({ action: 'STOP_AUTO_FLOW' });
        } catch (e) {}

        // 5. Ghi log khởi đầu
        addStepsLog(`📋 [Danh Sách Mới] Đã nạp thành công ${count} mã hồ sơ! Tiến độ (0/${count} mã, 0%), Bảng kết quả & Nhật ký đã được tự động làm mới.`, 'success');
    }

    if (stepsTextarea) {
        stepsTextarea.addEventListener('input', () => {
            updateStepsCodeView(true);
            triggerAutoSave();
        });

        // Bắt sự kiện Paste (Ctrl+V hoặc chuột phải)
        stepsTextarea.addEventListener('paste', () => {
            setTimeout(() => {
                const codes = MiniExcel.parseTextLines(stepsTextarea.value);
                if (codes.length > 0) {
                    resetPopupTableAndLogsForNewList(codes.length);
                    updateStepsCodeView(false);
                    triggerAutoSave();
                }
            }, 50);
        });
    }

    if (btnImportStepsFile && stepsFileInput) {
        btnImportStepsFile.addEventListener('click', () => {
            stepsFileInput.value = null;
            stepsFileInput.click();
        });

        stepsFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                const parsedCodes = MiniExcel.parseTextLines(event.target.result);
                if (parsedCodes.length > 0) {
                    stepsTextarea.value = parsedCodes.join('\n');
                    resetPopupTableAndLogsForNewList(parsedCodes.length);
                    updateStepsCodeView(false);
                    addStepsLog(`📁 Đã nạp ${parsedCodes.length} mã từ file: ${file.name}`, 'info');
                    triggerAutoSave();
                } else {
                    alert('Không tìm thấy mã hợp lệ trong file!');
                }
            };
            reader.readAsText(file, 'utf-8');
        });
    }

    // Các nút công thái học: Dán clipboard, Xóa rỗng, Sao chép mã
    if (btnPasteStepsList) {
        btnPasteStepsList.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    stepsTextarea.value = text;
                    const codes = MiniExcel.parseTextLines(text);
                    if (codes.length > 0) {
                        resetPopupTableAndLogsForNewList(codes.length);
                    }
                    updateStepsCodeView(false);
                    triggerAutoSave();
                } else {
                    addStepsLog('⚠️ Clipboard rỗng!', 'warning');
                }
            } catch (err) {
                addStepsLog('⚠️ Vui lòng dán trực tiếp bằng phím tắt Ctrl + V!', 'warning');
            }
        });
    }

    if (btnClearStepsList) {
        btnClearStepsList.addEventListener('click', () => {
            stepsTextarea.value = '';
            stepsTableRecords = [];
            renderStepsTable();
            saveStepsTableData();
            if (stepsLogBox) stepsLogBox.innerHTML = '';
            currentStepCodeIndex = 0;
            stepsProcessedMap = {};
            updateStepsCodeView(false);
            addStepsLog('🗑️ Đã xóa rỗng danh sách mã và làm mới Bảng kết quả.', 'info');
            triggerAutoSave();
        });
    }

    if (btnCopyCurrentStepCode) {
        btnCopyCurrentStepCode.addEventListener('click', () => {
            const currentCode = stepsCodesList[currentStepCodeIndex];
            if (currentCode) {
                navigator.clipboard.writeText(currentCode).then(() => {
                    addStepsLog(`📋 Đã sao chép mã "${currentCode}" vào Clipboard!`, 'success');
                }).catch(() => {
                    addStepsLog('❌ Không thể sao chép mã!', 'error');
                });
            } else {
                addStepsLog('⚠️ Chưa có mã hợp lệ để sao chép!', 'warning');
            }
        });
    }

    if (btnPrevCode) {
        btnPrevCode.addEventListener('click', () => {
            if (currentStepCodeIndex > 0) {
                currentStepCodeIndex--;
                updateStepsCodeView();
                addStepsLog(`⏮️ Đã chuyển về mã #${currentStepCodeIndex + 1}: ${stepsCodesList[currentStepCodeIndex]}`, 'info');
                triggerAutoSave();
            }
        });
    }

    if (btnNextCode) {
        btnNextCode.addEventListener('click', () => {
            if (currentStepCodeIndex < stepsCodesList.length - 1) {
                currentStepCodeIndex++;
                updateStepsCodeView();
                addStepsLog(`⏭️ Đã chuyển tới mã #${currentStepCodeIndex + 1}: ${stepsCodesList[currentStepCodeIndex]}`, 'info');
                triggerAutoSave();
            }
        });
    }

    // Helper tìm đúng Tab Web Vinasynet dù đang ở Full Tab hay Edge Sidebar
    async function findVinasynetTab() {
        if (typeof chrome === 'undefined' || !chrome.tabs) return null;
        try {
            // 1. Kiểm tra tab đang active ở cửa sổ hiện tại
            const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTabs && activeTabs.length > 0 && activeTabs[0].url && activeTabs[0].url.includes('ktdl.soxaydung.hungyen.gov.vn')) {
                return activeTabs[0];
            }

            // 2. Tìm tất cả các tab Vinasynet đang mở trên trình duyệt
            const allVsnTabs = await chrome.tabs.query({ url: "*://ktdl.soxaydung.hungyen.gov.vn/*" });
            if (allVsnTabs && allVsnTabs.length > 0) {
                const activeOne = allVsnTabs.find(t => t.active);
                return activeOne || allVsnTabs[0];
            }

            // 3. Fallback tìm theo url chứa domain ở mọi cửa sổ
            const allTabs = await chrome.tabs.query({});
            const matched = allTabs.find(t => t.url && t.url.includes('ktdl.soxaydung.hungyen.gov.vn'));
            if (matched) return matched;

            // 4. Nếu tab hiện tại trong cùng cửa sổ đang active (trường hợp click icon extension)
            if (activeTabs && activeTabs.length > 0) {
                return activeTabs[0];
            }

            return null;
        } catch (e) {
            console.warn('Lỗi tìm tab Vinasynet:', e);
            return null;
        }
    }

    // Helper gửi message tới Tab Web Vinasynet (có tự động nạp content script nếu chưa nạp)
    async function sendMessageToActiveTab(message) {
        try {
            const targetTab = await findVinasynetTab();
            if (!targetTab || !targetTab.id) {
                console.warn('Chưa tìm thấy tab Vinasynet để gửi message');
                return { success: false, error: 'NOT_FOUND_TAB' };
            }

            try {
                const res = await chrome.tabs.sendMessage(targetTab.id, message);
                if (res !== undefined) return res;
            } catch (errConnect) {
                console.log('Content script chưa sẵn sàng trên tab', targetTab.id, '-> Đang tự động nạp...');
                if (typeof chrome !== 'undefined' && chrome.scripting && chrome.scripting.executeScript) {
                    await chrome.scripting.executeScript({
                        target: { tabId: targetTab.id },
                        files: ['scripts/mini-excel.js', 'scripts/content.js']
                    });
                    await new Promise(r => setTimeout(r, 400));
                    return await chrome.tabs.sendMessage(targetTab.id, message);
                }
            }
        } catch (err) {
            console.warn('Lỗi kết nối content script:', err);
            return { success: false, error: err.message };
        }
        return { success: false, error: 'UNKNOWN_ERROR' };
    }

    // --- STEP 1: Tìm mã ---
    async function executeStep1() {
        if (stepsCodesList.length === 0) {
            alert('Vui lòng nhập danh sách mã trước!');
            return false;
        }
        const code = stepsCodesList[currentStepCodeIndex];
        addStepsLog(`1️⃣ BƯỚC 1: Đang điền từ khóa "${code}" vào ô tìm kiếm...`, 'info');
        
        let res = await sendMessageToActiveTab({ action: 'STEP1_SEARCH', code: code });
        
        if (!res || !res.success) {
            addStepsLog(`[B1] Gửi bộ lọc ngầm API cho mã: ${code}`, 'info');
        } else {
            addStepsLog(`[B1] ✅ Đã điền mã và kích hoạt nút Tìm kiếm trên trang web!`, 'success');
        }
        triggerAutoSave();
        return true;
    }

    // --- STEP 2: Đếm & Scan số bản ghi ---
    async function executeStep2() {
        if (stepsCodesList.length === 0) return false;
        const code = stepsCodesList[currentStepCodeIndex];
        addStepsLog(`2️⃣ BƯỚC 2: Đang đếm và scan các bản ghi của mã "${code}"...`, 'info');

        let checkRes = await sendMessageToActiveTab({ action: 'STEP2_SCAN' });
        
        if (!checkRes || !checkRes.success || !checkRes.items || checkRes.items.length === 0) {
            const apiRes = await VinasynetChecker.checkCode(code);
            checkRes = {
                success: true,
                count: apiRes.totalFound || 0,
                items: apiRes.foundItems || []
            };
        }

        const count = checkRes.count || 0;
        currentStepScanResult = checkRes;

        let noteText = '';
        let scanBadgeText = '';
        let scanStatusType = 'info';

        if (count > 1) {
            noteText = `⚠️ Có ${count} bản ghi TRÙNG (Xóa các bản thừa #2, #3...)`;
            scanBadgeText = `⚠️ Có ${count} bản TRÙNG`;
            scanStatusType = 'warning';
            addStepsLog(`[B2] ⚠️ SCAN: Tìm thấy ${count} bản ghi TRÙNG LẶP. Chuẩn bị xóa các bản thừa (#2, #3...)`, 'warning');
        } else if (count === 1) {
            noteText = `✅ Có 1 bản duy nhất (Note: PASS)`;
            scanBadgeText = `✅ 1 bản duy nhất`;
            scanStatusType = 'success';
            addStepsLog(`[B2] ✅ SCAN: Chỉ có 1 bản ghi duy nhất. Note: PASS (Giữ nguyên không xóa)`, 'success');
        } else {
            noteText = `❓ Không tìm thấy (Note: CHECK)`;
            scanBadgeText = `❌ Không tìm thấy`;
            scanStatusType = 'danger';
            addStepsLog(`[B2] ❓ SCAN: Không có bản ghi nào. Note: CHECK`, 'danger');
        }

        const keptInfo = checkRes.items && checkRes.items.length > 0 
            ? `${checkRes.items[0].tieuDe || checkRes.items[0].soLuuTru || 'Bản ghi #1'}` 
            : 'Không có';

        stepsProcessedMap[code] = {
            code: code,
            count: count,
            statusText: noteText,
            keptItem: checkRes.items && checkRes.items.length > 0 ? checkRes.items[0] : null,
            deletedItems: [],
            scanItems: checkRes.items || []
        };

        if (stepsCurrentStatusDisplay) {
            stepsCurrentStatusDisplay.textContent = `Trạng thái: ${noteText}`;
        }

        // Ghi log trực tiếp vào Bảng Kết Quả
        addOrUpdateStepsRow(
            code,
            scanBadgeText,
            keptInfo,
            count > 1 ? 'Chờ xóa bản #2...' : (count === 1 ? 'Giữ nguyên (PASS)' : 'Cần kiểm tra'),
            scanStatusType
        );

        triggerAutoSave();
        return checkRes;
    }

    // --- STEP 3: Tích chọn bản thừa & Click xóa hàng loạt (Chuyển trang Xóa bản ghi) ---
    async function executeStep3() {
        const code = stepsCodesList[currentStepCodeIndex];
        const info = stepsProcessedMap[code];

        addStepsLog(`3️⃣ BƯỚC 3: Đang tích chọn các bản trùng thừa & kích hoạt xóa hàng loạt (#ctl13_lnkDelete)...`, 'warning');

        let res = await sendMessageToActiveTab({ action: 'STEP3_CLICK_DELETE' });

        if (res && res.success) {
            const countMsg = res.count ? ` (${res.count} bản)` : '';
            addStepsLog(`[B3] 🎯 ${res.message || `Đã tích chọn các bản thừa${countMsg} và kích hoạt xóa!`}`, 'success');
            if (info) {
                info.statusText = 'Đang ở màn hình Xóa bản ghi';
                if (stepsCurrentStatusDisplay) stepsCurrentStatusDisplay.textContent = `Trạng thái: Đang ở màn hình Xóa bản ghi`;
            }
            addOrUpdateStepsRow(code, null, null, `🎯 Đã tích chọn${countMsg} & Bấm Xóa hàng loạt`, 'warning');
            triggerAutoSave();
            return true;
        } else {
            const errMsg = (res && res.message) ? res.message : 'Không tìm thấy nút xóa hoặc không có bản ghi trùng thừa trên web!';
            addStepsLog(`[B3] ⚠️ ${errMsg}`, 'danger');
            triggerAutoSave();
            return false;
        }
    }

    // --- STEP 4: Chọn Xác nhận xóa và Xóa ngay! trên trang Xóa bản ghi ---
    async function executeStep4() {
        addStepsLog(`4️⃣ BƯỚC 4: Đang tick "Xác nhận xóa" và nhấn "Xóa ngay !" trên trang Xóa bản ghi...`, 'warning');

        let res = await sendMessageToActiveTab({ action: 'STEP4_CONFIRM_AND_DELETE' });

        if (res && res.success) {
            addStepsLog(`[B4] 🎉 ĐÃ CHỌN XÁC NHẬN XÓA VÀ NHẤN "XÓA NGAY !" THÀNH CÔNG!`, 'success');
            const code = stepsCodesList[currentStepCodeIndex];
            const info = stepsProcessedMap[code];
            if (info) {
                info.statusText = 'Đã gửi lệnh Xóa ngay !';
                if (stepsCurrentStatusDisplay) stepsCurrentStatusDisplay.textContent = `Trạng thái: Đã gửi lệnh Xóa ngay !`;
            }
            // Ghi nhận vào bảng kết quả
            addOrUpdateStepsRow(code, null, null, '🎉 Đã chọn Xác nhận xóa & Nhấn Xóa ngay !', 'danger');
            triggerAutoSave();
            return true;
        } else {
            const errMsg = (res && res.message) ? res.message : 'Chưa ở màn hình Xóa bản ghi hoặc không tìm thấy nút Xóa!';
            addStepsLog(`[B4] ⚠️ ${errMsg}`, 'danger');
            triggerAutoSave();
            return false;
        }
    }

    // --- STEP 5: Bấm thoát ra để quay lại danh sách Quản lý hồ sơ ---
    async function executeStep5() {
        addStepsLog(`5️⃣ BƯỚC 5: Đang bấm nút Thoát ra để quay lại danh sách Quản lý hồ sơ...`, 'info');

        let res = await sendMessageToActiveTab({ action: 'STEP5_EXIT_BACK' });

        if (res && res.success) {
            addStepsLog(`[B5] 🚪 ĐÃ THOÁT RA! Đang quay lại trang danh sách Quản lý hồ sơ.`, 'success');
            const code = stepsCodesList[currentStepCodeIndex];
            const info = stepsProcessedMap[code];
            if (info) {
                info.statusText = 'Đã quay lại Quản lý hồ sơ';
                if (stepsCurrentStatusDisplay) stepsCurrentStatusDisplay.textContent = `Trạng thái: Đã quay lại Quản lý hồ sơ`;
            }
            // Ghi nhận vào bảng kết quả
            addOrUpdateStepsRow(code, null, null, '🚪 Đã quay lại danh sách hồ sơ (Hoàn tất)', 'success');
            triggerAutoSave();
            return true;
        } else {
            const errMsg = (res && res.message) ? res.message : 'Không thể thực hiện quay lại danh sách!';
            addStepsLog(`[B5] ⚠️ ${errMsg}`, 'danger');
            triggerAutoSave();
            return false;
        }
    }

    // Event Listeners cho các Button Bước
    if (btnStep1) btnStep1.addEventListener('click', executeStep1);
    if (btnStep2) btnStep2.addEventListener('click', executeStep2);
    if (btnStep3) btnStep3.addEventListener('click', executeStep3);
    if (btnStep4) btnStep4.addEventListener('click', executeStep4);
    if (btnStep5) btnStep5.addEventListener('click', executeStep5);

    // --- TỰ ĐỘNG XÓA HÀNG LOẠT (AUTO FLOW RUNNER) ---
    if (btnAutoDeleteRun) {
        btnAutoDeleteRun.addEventListener('click', async () => {
            const parsedCodes = MiniExcel.parseTextLines(stepsTextarea.value);
            if (parsedCodes.length === 0) {
                alert('Vui lòng nhập danh sách mã vào ô trên trước khi bấm tự động xóa!');
                return;
            }

            btnAutoDeleteRun.disabled = true;
            if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = false;
            if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'block';

            addStepsLog(`▶️ [Auto] Bắt đầu tự động xóa cho ${parsedCodes.length} mã...`, 'info');

            // Gửi lệnh tới content script
            const res = await sendMessageToActiveTab({ action: 'START_AUTO_FLOW', codes: parsedCodes });
            if (!res || !res.success) {
                addStepsLog(`⚠️ Không thể kết nối tới tab Vinasynet! Vui lòng mở trang "ktdl.soxaydung.hungyen.gov.vn" trên trình duyệt trước khi bấm Bắt đầu.`, 'danger');
                btnAutoDeleteRun.disabled = false;
                if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = true;
            } else {
                addStepsLog(`🚀 [Auto] Đã khởi chạy tiến trình tự động xóa trên trang web!`, 'success');
            }
        });
    }

    if (btnAutoDeleteStop) {
        btnAutoDeleteStop.addEventListener('click', async () => {
            btnAutoDeleteRun.disabled = false;
            btnAutoDeleteStop.disabled = true;
            if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'none';
            if (stepsAutoProgressText) stepsAutoProgressText.textContent = 'Đã dừng';
            if (stepsAutoProgressPercent) stepsAutoProgressPercent.textContent = '0%';
            if (stepsAutoProgressBarFill) stepsAutoProgressBarFill.style.width = '0%';
            highlightPopupStep(0);

            // Ghi tín hiệu ngắt khẩn cấp đồng bộ tới TẤT CẢ các tab web Vinasynet
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    await chrome.storage.local.set({
                        vsn_auto_flow: { isRunning: false, forceStopped: true, stoppedAt: Date.now() }
                    });
                } catch (e) {}
            }

            addStepsLog(`⏹️ [Auto] Đã bấm dừng tiến trình tự động xóa.`, 'danger');
            await sendMessageToActiveTab({ action: 'STOP_AUTO_FLOW' });
        });
    }

    let lastLoggedStep = 0;
    let lastLoggedCode = '';

    function highlightPopupStep(stepNum) {
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`btnStep${i}`);
            if (btn) {
                if (i === stepNum) {
                    btn.classList.add('step-active');
                } else {
                    btn.classList.remove('step-active');
                }
            }
        }
    }

    // Lắng nghe cập nhật tiến độ từ content script qua chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.vsn_auto_flow) {
                const flow = changes.vsn_auto_flow.newValue;
                if (!flow) return;

                if (flow.isRunning) {
                    if (btnAutoDeleteRun) btnAutoDeleteRun.disabled = true;
                    if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = false;
                    if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'block';

                    const total = (flow.codes && flow.codes.length) || 0;
                    const cur = flow.currentIndex || 0;
                    const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
                    const curCode = (flow.codes && flow.codes[cur]) || '';
                    const curStep = flow.currentStep || 1;

                    if (stepsAutoProgressText) stepsAutoProgressText.textContent = `Đang xử lý mã ${cur + 1}/${total} (${curCode})`;
                    if (stepsAutoProgressPercent) stepsAutoProgressPercent.textContent = `${pct}%`;
                    if (stepsAutoProgressBarFill) stepsAutoProgressBarFill.style.width = `${pct}%`;

                    highlightPopupStep(curStep);

                    const stepNames = {
                        1: `1️⃣ [B1] Tìm kiếm mã "${curCode}"`,
                        2: `2️⃣ [B2] Đếm & Scan số bản ghi của "${curCode}"`,
                        3: `3️⃣ [B3] Click nút xóa bản thừa #2`,
                        4: `4️⃣ [B4] Tick Xác nhận xóa & Nhấn Xóa ngay !`,
                        5: `5️⃣ [B5] Bấm Thoát ra quay lại danh sách Quản lý hồ sơ`
                    };

                    if (stepsCurrentStatusDisplay) {
                        stepsCurrentStatusDisplay.textContent = `Trạng thái: ${stepNames[curStep] || 'Đang chạy tự động'}`;
                    }

                    // Thêm log nếu đổi bước hoặc đổi mã
                    if (curStep !== lastLoggedStep || curCode !== lastLoggedCode) {
                        lastLoggedStep = curStep;
                        lastLoggedCode = curCode;
                        if (stepNames[curStep]) {
                            const logType = curStep === 4 ? 'danger' : (curStep === 3 ? 'warning' : 'info');
                            addStepsLog(stepNames[curStep], logType);
                        }
                    }
                } else {
                    if (btnAutoDeleteRun) btnAutoDeleteRun.disabled = false;
                    if (btnAutoDeleteStop) btnAutoDeleteStop.disabled = true;
                    if (stepsAutoProgressBox) stepsAutoProgressBox.style.display = 'none';
                    highlightPopupStep(0);
                    lastLoggedStep = 0;
                }
            }

            if (area === 'local' && changes.vsn_audit_records) {
                if (!changes.vsn_audit_records.newValue || changes.vsn_audit_records.newValue.length === 0) {
                    stepsTableRecords = [];
                    renderStepsTable();
                }
            }
            if (area === 'local' && changes.vsn_steps_table_records) {
                const newRows = changes.vsn_steps_table_records.newValue;
                if (Array.isArray(newRows) && newRows.length > 0) {
                    stepsTableRecords = newRows;
                    renderStepsTable();
                } else {
                    stepsTableRecords = [];
                    renderStepsTable();
                }
            }

            if (area === 'local' && changes.vsn_latest_log) {
                const l = changes.vsn_latest_log.newValue;
                if (l && l.msg) {
                    addStepsLog(l.msg, l.type || 'info');
                }
            }
        });
    }

    // =========================================================================
    // --- MODULE: TỰ ĐỘNG LƯU VÀ PHỤC HỒI TRẠNG THÁI (AUTO-SAVE & RESTORE) ---
    // =========================================================================

    let autoSaveTimer = null;
    function triggerAutoSave() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            saveExtensionState();
        }, 400);
    }

    function saveExtensionState() {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

        // Xác định tab đang mở
        const activeTabBtn = document.querySelector('.tab-nav .tab-btn.active');
        const activeTab = activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'singleTab';

        // Lấy danh sách log gần nhất (tối đa 40 dòng)
        const recentLogs = [];
        if (stepsLogBox) {
            stepsLogBox.querySelectorAll('.steps-log-line').forEach(el => {
                recentLogs.push({ text: el.textContent, className: el.className });
            });
        }
        const trimmedLogs = recentLogs.slice(-40);

        const state = {
            activeTab: activeTab,
            singleCode: singleInput ? singleInput.value : '',
            batchText: batchTextarea ? batchTextarea.value : '',
            batchResults: batchResults || [],
            deleteText: deleteTextarea ? deleteTextarea.value : '',
            deleteResults: deleteResults || [],
            stepsText: stepsTextarea ? stepsTextarea.value : '',
            currentStepCodeIndex: currentStepCodeIndex || 0,
            stepsProcessedMap: stepsProcessedMap || {},
            stepsLogs: trimmedLogs
        };

        try {
            chrome.storage.local.set({ 'vinasynet_ext_saved_state': state });
        } catch (e) {
            console.warn('Lỗi lưu state vào storage:', e);
        }
    }

    function renderRestoredBatchResults(results) {
        if (!batchTableBody || !Array.isArray(results) || results.length === 0) return;
        
        batchProgressWrapper.style.display = 'block';
        batchStatsBar.style.display = 'flex';
        batchTableWrapper.style.display = 'block';
        batchTableBody.innerHTML = '';

        let countExist = 0;
        let countNotExist = 0;
        let countError = 0;

        results.forEach((res, idx) => {
            const tr = document.createElement('tr');
            tr.id = `batchRow_${idx}`;
            const code = res.code || `Mã #${idx + 1}`;

            let statusHtml = '';
            let titleHtml = '-';
            let linkHtml = '-';

            if (res.isUnauthorized) {
                statusHtml = '<span class="badge-status badge-not-exist">Chưa login</span>';
                titleHtml = 'Vui lòng đăng nhập hệ thống';
                countError++;
            } else if (res.error) {
                statusHtml = '<span class="badge-status badge-not-exist">Lỗi</span>';
                titleHtml = res.error;
                countError++;
            } else if (res.exists) {
                countExist++;
                const first = (res.foundItems && res.foundItems[0]) || {};
                const count = res.totalFound || (res.foundItems ? res.foundItems.length : 1);
                const dup = res.duplicateAnalysis || {};

                if (count > 1) {
                    statusHtml = `<span class="badge-status badge-duplicate">Trùng ${count} HS</span>`;
                    const itemsDetailHtml = (res.foundItems || []).map((it, i) => `
                        <div class="batch-sub-item">
                            <span class="sub-idx">#${i + 1}</span> 
                            ${it.symbol ? `<span class="sub-symbol">[${it.symbol}]</span>` : ''}
                            ${it.sysCode ? `<span class="sub-syscode">(Mã: ${it.sysCode})</span>` : ''}
                            <span class="sub-title">${it.title || ''}</span>
                            <span class="sub-meta">${it.year ? `[Năm ${it.year}]` : ''} ${it.thbq ? `(THBQ: ${it.thbq})` : ''}</span>
                        </div>
                    `).join('');

                    titleHtml = `
                        <div class="batch-dup-summary">⚠️ ${dup.summary || `Trùng ${count} hồ sơ`}</div>
                        <div class="batch-items-detail-list">${itemsDetailHtml}</div>
                    `;

                    linkHtml = (res.foundItems || []).map((it, i) => 
                        it.detailUrl ? `<a href="${it.detailUrl}" target="_blank" class="batch-sub-link">🔗 HS${i + 1}</a>` : ''
                    ).filter(Boolean).join(' ') || '-';
                } else {
                    statusHtml = '<span class="badge-status badge-exist">Đã tồn tại</span>';
                    titleHtml = `<div>${first.symbol ? `<b style="color:#0369a1;">[${first.symbol}]</b> ` : ''}${first.title || ''} ${first.year ? `<span style="color:#64748b;">(${first.year})</span>` : ''}</div>`;
                    if (first.detailUrl) {
                        linkHtml = `<a href="${first.detailUrl}" target="_blank">🔗 Xem</a>`;
                    }
                }
            } else {
                countNotExist++;
                statusHtml = '<span class="badge-status badge-not-exist">Chưa có</span>';
                titleHtml = 'Không tìm thấy hồ sơ';
            }

            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td style="font-weight:600;">${code}</td>
                <td>${statusHtml}</td>
                <td class="table-title-cell">${titleHtml}</td>
                <td>${linkHtml}</td>
            `;
            batchTableBody.appendChild(tr);
        });

        if (statExist) statExist.textContent = countExist;
        if (statNotExist) statNotExist.textContent = countNotExist;
        if (statError) statError.textContent = countError;
        if (progressBarFill) progressBarFill.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
        if (progressText) progressText.textContent = `Dữ liệu đã khôi phục: ${results.length}/${results.length}`;
    }

    function renderRestoredDeleteResults(results) {
        if (!deleteTableBody || !Array.isArray(results) || results.length === 0) return;
        
        deleteProgressWrapper.style.display = 'block';
        deleteStatsBar.style.display = 'flex';
        deleteTableWrapper.style.display = 'block';
        deleteTableBody.innerHTML = '';

        let countKept = 0;
        let countDeleted = 0;
        let countSkipped = 0;

        results.forEach((resRecord, idx) => {
            const tr = document.createElement('tr');
            tr.id = `deleteRow_${idx}`;
            const code = resRecord.code || `Mã #${idx + 1}`;

            let statusHtml = '';
            let keptHtml = '-';
            let deletedHtml = '-';

            if (resRecord.statusText && resRecord.statusText.startsWith('Đã xóa')) {
                statusHtml = `<span class="badge-status badge-duplicate">${resRecord.statusText}</span>`;
                const kept = resRecord.keptItem || {};
                keptHtml = `<div style="color:#15803d;font-weight:600;">✓ Giữ #1: [${kept.symbol || 'N/A'}] (Mã HT: ${kept.sysCode || 'N/A'} | iid: ${kept.iid || 'N/A'})</div>`;
                countKept++;
                countDeleted += (resRecord.deletedItems ? resRecord.deletedItems.length : 0);

                const delListHtml = (resRecord.deletedItems || []).map((it, i) => `
                    <div style="color:#b91c1c;font-size:10px;margin-top:2px;">
                        🗑️ Đã xóa #${i + 2}: [${it.symbol || 'N/A'}] (Mã HT: ${it.sysCode || 'N/A'} | iid: ${it.iid || 'N/A'})
                    </div>
                `).join('');

                const failListHtml = (resRecord.failedItems || []).map((f) => `
                    <div style="color:#d97706;font-size:10px;margin-top:2px;">
                        ⚠️ Lỗi xóa #${f.item ? f.item.index : ''}: ${f.error}
                    </div>
                `).join('');

                deletedHtml = delListHtml + failListHtml || '-';
            } else if (resRecord.statusText && resRecord.statusText.includes('Bỏ qua')) {
                statusHtml = `<span class="badge-status badge-exist">Giữ 1 HS (Chưa trùng)</span>`;
                const kept = resRecord.keptItem || {};
                keptHtml = `<div><b>[${kept.symbol || 'N/A'}]</b> (iid: ${kept.iid || 'N/A'}) ${kept.title || ''}</div>`;
                deletedHtml = `<span style="color:#64748b;">(Không có bản thừa)</span>`;
                countKept++;
            } else {
                statusHtml = `<span class="badge-status badge-not-exist">${resRecord.statusText || 'Không tìm thấy'}</span>`;
                keptHtml = resRecord.note || '-';
                deletedHtml = '-';
                countSkipped++;
            }

            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td style="font-weight:600;">${code}</td>
                <td>${statusHtml}</td>
                <td class="table-title-cell">${keptHtml}</td>
                <td>${deletedHtml}</td>
            `;
            deleteTableBody.appendChild(tr);
        });

        if (statKept) statKept.textContent = countKept;
        if (statDeleted) statDeleted.textContent = countDeleted;
        if (statDeleteSkipped) statDeleteSkipped.textContent = countSkipped;
        if (deleteProgressBarFill) deleteProgressBarFill.style.width = '100%';
        if (deleteProgressPercent) deleteProgressPercent.textContent = '100%';
        if (deleteProgressText) deleteProgressText.textContent = `Dữ liệu đã khôi phục: ${results.length}/${results.length}`;
    }

    function loadExtensionState() {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get(['vinasynet_ext_saved_state'], (data) => {
            const state = data ? data.vinasynet_ext_saved_state : null;
            if (!state) return;

            // 1. Phục hồi Single check
            if (singleInput && state.singleCode) {
                singleInput.value = state.singleCode;
            }

            // 2. Phục hồi Batch check
            if (batchTextarea && state.batchText) {
                batchTextarea.value = state.batchText;
                updateBatchCount();
            }
            if (Array.isArray(state.batchResults) && state.batchResults.length > 0) {
                batchResults = state.batchResults;
                renderRestoredBatchResults(batchResults);
            }

            // 3. Phục hồi Delete check
            if (deleteTextarea && state.deleteText) {
                deleteTextarea.value = state.deleteText;
                updateDeleteCount();
            }
            if (Array.isArray(state.deleteResults) && state.deleteResults.length > 0) {
                deleteResults = state.deleteResults;
                renderRestoredDeleteResults(deleteResults);
            }

            // 4. Phục hồi 7 Steps
            if (stepsTextarea && state.stepsText) {
                stepsTextarea.value = state.stepsText;
            }
            if (state.stepsProcessedMap && typeof state.stepsProcessedMap === 'object') {
                stepsProcessedMap = state.stepsProcessedMap;
            }
            if (typeof state.currentStepCodeIndex === 'number') {
                currentStepCodeIndex = state.currentStepCodeIndex;
            }
            updateStepsCodeView();

            // Khôi phục log 7 bước (chỉ khôi phục nếu chưa có log thời gian thực từ vsn_saved_logs)
            if (stepsLogBox && (!stepsLogBox.children.length || stepsLogBox.querySelector('.steps-log-placeholder')) && Array.isArray(state.stepsLogs) && state.stepsLogs.length > 0) {
                stepsLogBox.innerHTML = '';
                state.stepsLogs.forEach(l => {
                    const line = document.createElement('div');
                    line.className = l.className || 'steps-log-line info';
                    line.textContent = l.text;
                    stepsLogBox.appendChild(line);
                });
                stepsLogBox.scrollTop = stepsLogBox.scrollHeight;
            }

            // 5. Khôi phục tab đang mở trước đó
            if (state.activeTab) {
                const targetBtn = document.querySelector(`.tab-nav .tab-btn[data-tab="${state.activeTab}"]`);
                if (targetBtn) {
                    targetBtn.click();
                }
            }
        });
    }

    // Tự động load dữ liệu đã lưu khi mở extension
    loadExtensionState();
});
