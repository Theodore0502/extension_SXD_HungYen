# Hướng Dẫn Cài Đặt & Sử Dụng Extension Kiểm Tra Mã Hồ Sơ Lưu Trữ

Tiện ích mở rộng (**Chrome Extension**) giúp cán bộ, chuyên viên kiểm tra nhanh và kiểm tra hàng loạt xem mã hồ sơ (hoặc ký hiệu) đã tồn tại trên **Hệ thống lưu trữ điện tử Sở Xây dựng Hưng Yên** (`ktdl.soxaydung.hungyen.gov.vn`) hay chưa.

---

## 1. Cách Cài Đặt Lên Trình Duyệt (Chrome, Cốc Cốc, Edge, Brave, ...)

1. Mở trình duyệt Google Chrome (hoặc Cốc Cốc, Edge).
2. Truy cập vào đường dẫn:
   - Trên Chrome: `chrome://extensions/`
   - Trên Cốc Cốc: `coccoc://extensions/`
   - Trên Edge: `edge://extensions/`
3. Bật công tắc **"Chế độ dành cho nhà phát triển"** (**Developer mode**) ở góc trên bên phải màn hình.
4. Bấm vào nút **"Tải tiện ích đã giải nén"** (**Load unpacked**).
5. Chọn thư mục chứa Extension:
   `F:\extension HY`
6. Bấm vào biểu tượng mảnh ghép (Extensions) trên thanh công cụ của trình duyệt và bấm **Ghim (Pin)** biểu tượng `HY` để tiện sử dụng mỗi ngày.

---

## 2. Hướng Dẫn Sử Dụng

> **Lưu ý quan trọng**: Trước khi tra cứu, hãy mở tab và đăng nhập vào tài khoản của bạn trên trang:
> `http://ktdl.soxaydung.hungyen.gov.vn/`
> Tiện ích sẽ tự động tái sử dụng phiên đăng nhập đó để truy vấn bảo mật.

### Chế độ 1: Kiểm tra nhanh từng mã (Tab "Kiểm tra nhanh")
1. Mở popup extension.
2. Nhập hoặc dán mã cần kiểm tra:
   - Nhập **Ký hiệu hồ sơ** (ví dụ: `H31.05.02.H31.09.2014.743`)
   - HOẶC nhập **Mã hệ thống** (ví dụ: `H31.09.2014.046301`)
3. Bấm **Enter** hoặc bấm nút **"Kiểm tra"**.
4. Kết quả sẽ hiện ngay lập tức:
   - 🟢 **1 HỒ SƠ TỒN TẠI**: Hiển thị Ký hiệu, Mã hệ thống, Năm, THBQ, Tiêu đề hồ sơ và đường link bấm vào để mở trực tiếp hồ sơ trên web.
   - 🟠 **TRÙNG NHIỀU HỒ SƠ (> 1)**: Thông báo số lượng hồ sơ tìm thấy, tự động so sánh đối chiếu (Tên, Ký hiệu, Mã, Năm, THBQ) và kết luận rõ ràng **trùng ở những chỗ nào**, đồng thời liệt kê chi tiết từng hồ sơ kèm link xem.
   - 🔴 **CHƯA TỒN TẠI**: Thông báo không có hồ sơ nào trùng khớp.

---

### Chế độ 2: Kiểm tra hàng loạt (Tab "Kiểm tra hàng loạt")
1. Chuyển sang tab **"Kiểm tra hàng loạt"**.
2. Dán danh sách mã vào khung văn bản (mỗi dòng một mã) HOẶC bấm nút **"📁 Nhập từ file (.txt / .csv)"**.
3. Bấm **"🚀 Bắt đầu quét"**.
4. Tiện ích sẽ lần lượt kiểm tra từng mã, hiển thị thanh tiến trình trực quan. Nếu có mã tìm thấy > 1 hồ sơ, hệ thống sẽ đánh dấu nhãn màu cam `Trùng X HS` và ghi chú rõ ràng các điểm trùng lặp.
5. Sau khi quét xong (hoặc bất kỳ lúc nào), bấm nút **"📊 Xuất Excel"** để tải file kết quả `.csv` có đầy đủ các cột: *Số lượng HS tìm thấy, Đánh giá trùng lặp, Trùng ở những chỗ nào, Danh sách tiêu đề...* hỗ trợ hiển thị tiếng Việt chuẩn UTF-8 trong Microsoft Excel.
