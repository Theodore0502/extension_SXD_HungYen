/**
 * Module xử lý tra cứu hồ sơ trên hệ thống ktdl.soxaydung.hungyen.gov.vn
 */

const VinasynetChecker = {
    DEFAULT_BASE_URL: 'http://ktdl.soxaydung.hungyen.gov.vn',

    /**
     * Chuẩn hóa từ khóa tìm kiếm giống cách thức ZMFilterClick trên web xử lý
     */
    sanitizeKeyword: function(keyword) {
        if (!keyword) return '';
        let kw = keyword.trim();
        kw = kw.replace(/ /g, '+');
        kw = kw.replace(/''/g, '');
        kw = kw.replace(/'/g, '');
        kw = kw.replace(/;/g, '');
        kw = kw.replace(/\$/g, '');
        kw = kw.replace(/&/g, '');
        return kw;
    },

    /**
     * Tra cứu 1 mã hồ sơ (Ký hiệu hoặc Mã hệ thống)
     * @param {string} code - Mã cần kiểm tra
     * @param {string} baseUrl - Tùy chọn base url nếu khác mặc định
     * @param {number} fondId - Phông lưu trữ (mặc định 7: Sở Xây dựng tỉnh Hưng Yên)
     * @returns {Promise<{exists: boolean, code: string, foundItems: Array, totalFound: number, duplicateAnalysis?: Object, error?: string, isUnauthorized?: boolean}>}
     */
    checkCode: async function(code, baseUrl = this.DEFAULT_BASE_URL, fondId = 7) {
        const cleanCode = (code || '').trim();
        if (!cleanCode) {
            return { exists: false, code: cleanCode, foundItems: [], totalFound: 0, error: 'Mã rỗng' };
        }

        const encodedKw = this.sanitizeKeyword(cleanCode);
        const rf = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        // Endpoint lọc hồ sơ theo từ khóa
        const filterUrl = `${baseUrl}/systems/filesmanager/vmode/filter/index.aspx?f=${fondId}&y=0&g=0&kw=${encodedKw}&am=0,1,2&rf=${rf}`;

        try {
            const response = await fetch(filterUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cache-Control': 'no-cache'
                },
                credentials: 'include' // Giữ phiên đăng nhập
            });

            if (!response.ok) {
                return {
                    exists: false,
                    code: cleanCode,
                    foundItems: [],
                    totalFound: 0,
                    error: `Lỗi kết nối máy chủ (${response.status} ${response.statusText})`
                };
            }

            const htmlText = await response.text();

            // Kiểm tra xem trang có bị chuyển hướng về màn hình Login không
            if (htmlText.includes('id="VSNLoginPage"') || htmlText.includes('txtPassword') || htmlText.includes('autoSetWindowSize(zmcore, hdfWS)')) {
                return {
                    exists: false,
                    code: cleanCode,
                    foundItems: [],
                    totalFound: 0,
                    isUnauthorized: true,
                    error: 'Chưa đăng nhập! Vui lòng đăng nhập vào trang ktdl.soxaydung.hungyen.gov.vn trước.'
                };
            }

            // Phân tích cú pháp HTML trả về từ máy chủ
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            const rows = doc.querySelectorAll('tr.item');
            const foundItems = [];
            const searchCodeLower = cleanCode.toLowerCase();

            rows.forEach((tr, index) => {
                // Cột ký hiệu - Cột 3
                const symbolCol = tr.querySelector('td:nth-child(3)');
                const symbolText = symbolCol ? symbolCol.textContent.trim() : '';

                // Cột tiêu đề & chi tiết - Cột 4 (td.name)
                const nameCol = tr.querySelector('td.name');
                const titleEl = nameCol ? nameCol.querySelector('h1') : null;
                const titleText = titleEl ? titleEl.textContent.trim() : '';

                // Mã hệ thống nằm trong thẻ span: "Mã: H31.09.2014.046301"
                let sysCodeText = '';
                if (nameCol) {
                    const smenusSpan = nameCol.querySelector('.smenus span');
                    if (smenusSpan) {
                        const spanTxt = smenusSpan.textContent.trim();
                        const match = spanTxt.match(/Mã:\s*([A-Za-z0-9\.\-_]+)/);
                        if (match) {
                            sysCodeText = match[1].trim();
                        } else {
                            sysCodeText = spanTxt.replace(/^Mã:\s*/i, '').trim();
                        }
                    }
                }

                // Thời hạn bảo quản (THBQ) - Cột 5
                const thbqCol = tr.querySelector('td:nth-child(5)');
                const thbqText = thbqCol ? thbqCol.textContent.trim() : '';

                // Năm - Cột 6
                const yearCol = tr.querySelector('td:nth-child(6)');
                const yearText = yearCol ? yearCol.textContent.trim() : '';

                // Chi tiết URL & iid
                let detailUrl = '';
                let iid = '';
                const chkBox = tr.querySelector('input[id^="chkItem"]');
                if (chkBox) {
                    iid = chkBox.getAttribute('dpa') || chkBox.id.replace('chkItem', '');
                }

                if (nameCol) {
                    const detailLink = nameCol.querySelector('a[href*="filesviewdetail"]');
                    if (detailLink) {
                        detailUrl = detailLink.getAttribute('href');
                        if (!iid && detailUrl) {
                            const match = detailUrl.match(/iid\/(\d+)\//i);
                            if (match) iid = match[1];
                        }
                        if (detailUrl && !detailUrl.startsWith('http')) {
                            detailUrl = baseUrl + (detailUrl.startsWith('/') ? '' : '/') + detailUrl;
                        }
                    }
                }

                const cleanSymbolLower = symbolText.toLowerCase();
                const cleanSysCodeLower = sysCodeText.toLowerCase();
                const exactMatch = cleanSymbolLower === searchCodeLower || cleanSysCodeLower === searchCodeLower;

                foundItems.push({
                    index: index + 1,
                    iid: iid,
                    symbol: symbolText,
                    sysCode: sysCodeText,
                    title: titleText,
                    thbq: thbqText,
                    year: yearText,
                    detailUrl: detailUrl,
                    exactMatch: exactMatch
                });
            });

            // Phân tích trùng lặp nếu tìm thấy > 1 hồ sơ
            const duplicateAnalysis = this.analyzeDuplicates(foundItems);

            return {
                exists: foundItems.length > 0,
                code: cleanCode,
                foundItems: foundItems,
                totalFound: foundItems.length,
                duplicateAnalysis: duplicateAnalysis
            };

        } catch (err) {
            return {
                exists: false,
                code: cleanCode,
                foundItems: [],
                totalFound: 0,
                duplicateAnalysis: null,
                error: `Không thể kết nối: ${err.message}`
            };
        }
    },

    /**
     * Xóa 1 bản ghi hồ sơ theo iid
     * @param {string|number} iid - ID của hồ sơ cần xóa
     * @param {string} baseUrl - Base URL
     * @returns {Promise<{success: boolean, iid: string|number, error?: string, isUnauthorized?: boolean}>}
     */
    deleteRecord: async function(iid, baseUrl = this.DEFAULT_BASE_URL) {
        if (!iid) {
            return { success: false, iid: iid, error: 'Thiếu ID hồ sơ (iid)' };
        }

        const rf = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        const deleteUrl = `${baseUrl}/systems/filesdelete/mode/single/iid/${iid}/index.aspx?am=0,1,2&rf=${rf}`;

        try {
            const response = await fetch(deleteUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Cache-Control': 'no-cache'
                },
                credentials: 'include'
            });

            if (!response.ok) {
                return { success: false, iid: iid, error: `Lỗi kết nối máy chủ (${response.status})` };
            }

            const htmlText = await response.text();
            if (htmlText.includes('id="VSNLoginPage"') || htmlText.includes('txtPassword')) {
                return { success: false, iid: iid, isUnauthorized: true, error: 'Chưa đăng nhập' };
            }

            return { success: true, iid: iid };
        } catch (err) {
            return { success: false, iid: iid, error: err.message };
        }
    },

    /**
     * Chuẩn hóa chuỗi để so sánh (loại bỏ dấu cách thừa, chuyển chữ thường)
     */
    cleanString: function(str) {
        if (!str) return '';
        return str.toString().trim().replace(/\s+/g, ' ').toLowerCase();
    },

    /**
     * Phân tích và so sánh các hồ sơ trùng lặp khi số lượng > 1
     * @param {Array} items - Danh sách các hồ sơ tìm được
     * @returns {Object} Thông tin chi tiết về việc trùng ở những chỗ nào
     */
    analyzeDuplicates: function(items) {
        if (!items || items.length <= 1) {
            return {
                hasMultiple: false,
                count: items ? items.length : 0,
                summary: items && items.length === 1 ? 'Chỉ có 1 hồ sơ duy nhất' : 'Không có hồ sơ',
                sameFields: [],
                diffFields: [],
                details: []
            };
        }

        const count = items.length;
        const first = items[0];

        // So sánh các trường thông tin cơ bản: Tiêu đề (Tên), Ký hiệu, Mã hệ thống, Năm, THBQ
        const cleanTitle0 = this.cleanString(first.title);
        const cleanSymbol0 = this.cleanString(first.symbol);
        const cleanSysCode0 = this.cleanString(first.sysCode);
        const cleanYear0 = this.cleanString(first.year);
        const cleanThbq0 = this.cleanString(first.thbq);

        let sameTitle = true;
        let sameSymbol = true;
        let sameSysCode = true;
        let sameYear = true;
        let sameThbq = true;

        for (let i = 1; i < count; i++) {
            if (this.cleanString(items[i].title) !== cleanTitle0) sameTitle = false;
            if (this.cleanString(items[i].symbol) !== cleanSymbol0) sameSymbol = false;
            if (this.cleanString(items[i].sysCode) !== cleanSysCode0) sameSysCode = false;
            if (this.cleanString(items[i].year) !== cleanYear0) sameYear = false;
            if (this.cleanString(items[i].thbq) !== cleanThbq0) sameThbq = false;
        }

        const sameFields = [];
        const diffFields = [];

        if (sameTitle && cleanTitle0) sameFields.push('Tên hồ sơ'); else diffFields.push('Tên hồ sơ');
        if (sameSymbol && cleanSymbol0) sameFields.push('Ký hiệu'); else diffFields.push('Ký hiệu');
        if (sameSysCode && cleanSysCode0) sameFields.push('Mã hệ thống'); else diffFields.push('Mã hệ thống');
        if (sameYear && cleanYear0) sameFields.push('Năm'); else diffFields.push('Năm');
        if (sameThbq && cleanThbq0) sameFields.push('THBQ'); else diffFields.push('THBQ');

        // Tạo câu kết luận tóm tắt
        let summary = '';
        if (sameFields.length === 0) {
            summary = `Có ${count} hồ sơ khác nhau hoàn toàn (khác tên, ký hiệu, năm...)`;
        } else if (sameTitle && sameSymbol && sameYear) {
            summary = `Có ${count} hồ sơ trùng hoàn toàn cả Tên, Ký hiệu và Năm`;
        } else if (sameTitle && sameYear) {
            summary = `Có ${count} hồ sơ trùng Tên hồ sơ & Năm (khác: ${diffFields.join(', ')})`;
        } else if (sameTitle) {
            summary = `Có ${count} hồ sơ trùng Tên hồ sơ (khác: ${diffFields.join(', ')})`;
        } else if (sameSymbol) {
            summary = `Có ${count} hồ sơ trùng Ký hiệu (khác: ${diffFields.join(', ')})`;
        } else {
            summary = `Có ${count} hồ sơ trùng: ${sameFields.join(', ')} (khác: ${diffFields.join(', ')})`;
        }

        return {
            hasMultiple: true,
            count: count,
            summary: summary,
            sameFields: sameFields,
            diffFields: diffFields,
            sameTitle: sameTitle,
            sameSymbol: sameSymbol,
            sameSysCode: sameSysCode,
            sameYear: sameYear,
            sameThbq: sameThbq
        };
    }
};

if (typeof window !== 'undefined') {
    window.VinasynetChecker = VinasynetChecker;
}
