/* Mini XLSX CSV Helper for Extension */
const MiniExcel = {
    /**
     * Parse nội dung file CSV / TXT thành mảng các chuỗi mã
     */
    parseTextLines: function(text) {
        if (!text) return [];
        return text
            .split(/[\r\n,;]+/)
            .map(item => item.trim())
            .filter(item => item.length > 0 && !item.toLowerCase().startsWith('mã') && !item.toLowerCase().startsWith('ký hiệu'));
    },

    /**
     * Xuất danh sách kết quả ra file CSV chuẩn UTF-8 (có BOM để Excel mở không lỗi font tiếng Việt)
     */
    exportResultsToCSV: function(results, filename = 'ket_qua_kiem_tra_ho_so.csv') {
        const headers = [
            'STT',
            'Mã kiểm tra',
            'Trạng thái',
            'Số lượng HS tìm thấy',
            'Đánh giá trùng lặp',
            'Tóm tắt đối chiếu',
            'Ký hiệu hồ sơ (HS 1)',
            'Mã hệ thống (HS 1)',
            'Tiêu đề hồ sơ (HS 1)',
            'Năm (HS 1)',
            'Thời hạn bảo quản (HS 1)',
            'Link chi tiết (HS 1)',
            'Nội dung chi tiết tất cả hồ sơ quét được',
            'Ghi chú / Lỗi'
        ];
        
        const rows = results.map((res, idx) => {
            const stt = idx + 1;
            const code = `"${(res.code || '').replace(/"/g, '""')}"`;
            
            let status = 'CHƯA TỒN TẠI';
            if (res.error) {
                status = 'Lỗi kiểm tra';
            } else if (res.exists) {
                status = res.totalFound > 1 ? `ĐÃ TỒN TẠI (${res.totalFound} HS)` : 'ĐÃ TỒN TẠI (1 HS)';
            }
            
            const totalCount = res.totalFound || (res.foundItems ? res.foundItems.length : 0);
            const dupAnalysis = res.duplicateAnalysis || {};
            
            let dupEvaluation = '';
            let dupWhere = '';
            if (totalCount > 1) {
                dupEvaluation = dupAnalysis.sameTitle ? 'CÙNG TIÊU ĐỀ' : 'KHÁC TIÊU ĐỀ';
                dupWhere = `"${(dupAnalysis.summary || '').replace(/"/g, '""')}"`;
            } else if (totalCount === 1) {
                dupEvaluation = '1 hồ sơ duy nhất';
                dupWhere = '""';
            } else {
                dupEvaluation = 'Không tìm thấy';
                dupWhere = '""';
            }

            const firstFound = res.foundItems && res.foundItems.length > 0 ? res.foundItems[0] : {};
            const symbol = `"${(firstFound.symbol || '').replace(/"/g, '""')}"`;
            const sysCode = `"${(firstFound.sysCode || '').replace(/"/g, '""')}"`;
            const title = `"${(firstFound.title || '').replace(/"/g, '""')}"`;
            const year = firstFound.year || '';
            const thbq = firstFound.thbq || '';
            const link = `"${(firstFound.detailUrl || '').replace(/"/g, '""')}"`;

            // Danh sách tất cả các thông tin chi tiết của từng hồ sơ nếu tìm thấy
            let allDetailsStr = '';
            if (res.foundItems && res.foundItems.length > 0) {
                allDetailsStr = res.foundItems.map((item, i) => 
                    `[HS ${i+1}] Ký hiệu: ${item.symbol || 'N/A'} | Mã HT: ${item.sysCode || 'N/A'} | Năm: ${item.year || 'N/A'} ${item.thbq ? `(THBQ: ${item.thbq})` : ''} | Tiêu đề: ${item.title || 'N/A'}`
                ).join(' ; ');
            }
            const allDetails = `"${allDetailsStr.replace(/"/g, '""')}"`;

            const note = `"${(res.error || '').replace(/"/g, '""')}"`;

            return [
                stt,
                code,
                status,
                totalCount,
                `"${dupEvaluation}"`,
                dupWhere,
                symbol,
                sysCode,
                title,
                year,
                thbq,
                link,
                allDetails,
                note
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Xuất báo cáo xóa trùng ra file CSV
     */
    exportDeleteResultsToCSV: function(results, filename = 'bao_cao_xoa_trung_ho_so.csv') {
        const headers = [
            'STT',
            'Mã kiểm tra',
            'Trạng thái xử lý',
            'Tổng số HS ban đầu',
            'HS Giữ lại (Mã HT / iid)',
            'Tiêu đề HS giữ lại',
            'Số bản ghi đã xóa',
            'Danh sách các iid đã xóa',
            'Chi tiết kết quả xóa'
        ];

        const rows = results.map((res, idx) => {
            const stt = idx + 1;
            const code = `"${(res.code || '').replace(/"/g, '""')}"`;
            const status = `"${(res.statusText || '').replace(/"/g, '""')}"`;
            const initialCount = res.totalFound || 0;
            
            const kept = res.keptItem || {};
            const keptInfo = `"${(kept.sysCode || kept.symbol || kept.iid || 'N/A').replace(/"/g, '""')} (iid: ${kept.iid || 'N/A'})"`;
            const keptTitle = `"${(kept.title || '').replace(/"/g, '""')}"`;
            
            const deletedCount = res.deletedItems ? res.deletedItems.length : 0;
            const deletedIidsStr = (res.deletedItems || []).map(it => `iid:${it.iid}`).join(' ; ');
            const deletedIids = `"${deletedIidsStr.replace(/"/g, '""')}"`;
            
            const detailNote = `"${(res.note || '').replace(/"/g, '""')}"`;

            return [
                stt,
                code,
                status,
                initialCount,
                keptInfo,
                keptTitle,
                deletedCount,
                deletedIids,
                detailNote
            ].join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

if (typeof window !== 'undefined') {
    window.MiniExcel = MiniExcel;
}
