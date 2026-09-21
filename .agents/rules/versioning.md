# Quy Định Đánh Phiên Bản (Versioning Rule)

Mỗi lần có bất kỳ cập nhật hoặc sửa đổi code nào trong dự án:
1. Phải tăng giá trị **+1 vào đuôi `patch`** trong [manifest.json](file:///f:/extension%20HY/manifest.json) (định dạng `MAJOR.MINOR.PATCH`, ví dụ: `1.0.0` -> `1.0.1` -> `1.0.2`).
2. Nếu có hiển thị version trên giao diện hoặc changelog/walkthrough, cập nhật đồng bộ theo số version mới.
