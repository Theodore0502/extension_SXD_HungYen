# Skill 00 — Refactor Master Plan

## Vai trò
Bạn là senior fullstack + AI engineer. Nhiệm vụ là refactor repo theo từng phase, không rewrite toàn bộ app, không phá business flow hiện có.

## Mục tiêu tổng
Làm code sạch hơn, an toàn hơn, dễ debug hơn, giảm latency AI speaking flow, và chuẩn bị nền để scale.

## Nguyên tắc bắt buộc
1. Không thay đổi API contract nếu chưa cập nhật frontend/backend đồng bộ.
2. Không xóa business logic nếu chưa có test hoặc manual test thay thế.
3. Mỗi phase phải commit nhỏ, dễ review.
4. Ưu tiên sửa risk production trước: security, data integrity, stuck polling, queue blocking.
5. Không đưa dev/mock path hoặc local_path vào production flow.
6. Mọi refactor phải giữ nguyên luồng chính:
   - Student chọn lesson/scenario
   - Start/record
   - Upload audio
   - Create turn
   - Enqueue AI job
   - Worker xử lý AI
   - FE nhận transcript/reply/feedback
   - End session
   - Evaluation cuối buổi

## Thư mục trọng tâm
- `src/apps/web`
- `src/apps/api`
- `src/apps/worker`
- `src/agents`
- Các file `.md` liên quan architecture, AI flow, changelog, report

## Thứ tự phase
1. Security hardening
2. Session lifecycle và data integrity
3. Frontend speaking screen cleanup
4. Audio pipeline WAV → WebM/Opus
5. Turn status, polling nhẹ, optimistic UI
6. Worker refactor và queue priority
7. AI runtime latency: TTS/background metrics/prompt ngắn
8. Final evaluation reliability
9. Observability và latency metrics
10. Cleanup, tests, documentation

## Definition of Done chung
- Typecheck/build pass.
- Không còn hardcoded local path trong production flow.
- Không có file chính nào vượt quá 350 dòng nếu có thể tách hợp lý.
- Có manual test checklist cho từng phase.
- Có rollback path rõ ràng.
- Không tăng latency cảm nhận của turn realtime.
