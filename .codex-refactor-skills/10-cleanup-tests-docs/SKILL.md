# Skill 10 — Cleanup, Tests & Documentation

## Mục tiêu
Sau refactor, dọn code thừa, thêm test/manual test, cập nhật tài liệu để team và Codex phase sau không hiểu sai flow.

## Phạm vi
- Toàn repo
- `README.md`
- `ARCHITECTURE.md`
- docs `.md`
- test folders
- mock/dev files

## Cleanup checklist
- [ ] Xóa hardcoded path Windows/local audio.
- [ ] Xóa mock API dùng trong production import.
- [ ] Xóa unused imports, dead code.
- [ ] Không để file > 350 dòng nếu có thể tách.
- [ ] Không duplicate type giữa FE/API nếu có thể share hoặc generate.
- [ ] Env vars được document rõ.
- [ ] Error message thân thiện cho user, chi tiết kỹ thuật ở log.

## Test cần có

### Manual test AI speaking
1. Vào màn speaking, không bấm mic, thoát ra:
   - không tạo active session
   - không tạo turn

2. Bấm mic lần đầu, nói 3–5 giây, nhả:
   - recording bắt đầu ngay
   - session prepared tạo song song
   - upload thành công
   - first turn active session
   - transcript/reply hiển thị

3. Gửi audio WebM/Opus:
   - API nhận đúng MIME
   - Worker xử lý đúng
   - Python transcribe đúng

4. AI runtime fail:
   - turn status failed rõ
   - FE không spinner vô hạn

5. End session:
   - chuyển feedback page ngay
   - evaluation pending/generating
   - success hiển thị report
   - fail hiển thị lỗi

### Security manual test
1. Signup sửa request role=admin:
   - không tạo admin

2. Gửi local_path:
   - production reject

3. Gọi Python runtime không key:
   - reject

4. Upload file quá lớn/không phải audio:
   - reject

## Documentation cần cập nhật
- Speaking session lifecycle.
- Audio format support.
- Queue architecture.
- AI runtime endpoints.
- Environment variables.
- Manual test checklist.
- Latency measurement guide.

## Acceptance Criteria
1. Build/typecheck/test pass.
2. Manual test checklist được ghi vào docs.
3. Không còn mâu thuẫn “pre-create session khi vào màn” với flow mới.
4. Repo dễ đọc hơn, phase sau tiếp tục được.
