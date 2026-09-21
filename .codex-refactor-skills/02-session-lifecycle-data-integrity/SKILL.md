# Skill 02 — Session Lifecycle & Data Integrity

## Mục tiêu
Sửa flow tạo session để giảm latency lượt đầu mà không sinh session rác, đồng thời tăng tính đúng dữ liệu.

## Trạng thái session đề xuất
- `prepared`: session đã được chuẩn bị nhưng chưa có turn thật.
- `active`: đã có ít nhất một student turn upload thành công.
- `completed`: bài học hoàn tất.
- `abandoned`: prepared nhưng không có turn sau một khoảng thời gian.
- `failed`: lỗi hệ thống.

## Không được làm
Không tạo `speaking_sessions` khi user chỉ vào màn speaking.

## Flow đúng
```text
User vào màn speaking
→ không tạo session

User bấm mic lần đầu
→ FE start recording ngay
→ FE gọi create session status=prepared song song

User nhả mic
→ stop recording
→ đợi sessionId nếu chưa xong
→ upload audio
→ API tạo first turn
→ API chuyển session prepared → active
→ ghi event SESSION_STARTED hoặc SESSION_ACTIVATED
```

## Phạm vi file
- `src/apps/web/src/features/speaking-session/**`
- `src/apps/api/src/modules/speaking-sessions/**`
- `src/apps/api/prisma/schema.prisma`
- worker completion logic nếu có

## Việc cần làm

### 1. Backend hỗ trợ initialStatus
Endpoint `POST /speaking-sessions` nên nhận optional:
```json
{
  "speakingTopicVersionId": "...",
  "scenarioId": "...",
  "lessonId": "...",
  "initialStatus": "prepared"
}
```

Validation:
- Chỉ cho `prepared` hoặc default safe.
- Không cho client tùy tiện set `completed`, `failed`, `abandoned`.

### 2. First turn activates session
Trong upload turn:
- Nếu session status = `prepared` và đây là first turn:
  - update status = `active`
  - set `startedAt` nếu cần
  - ghi event `SESSION_STARTED`
- Nếu session completed/failed/abandoned:
  - reject upload.

### 3. Cleanup prepared session
Tạo cleanup job hoặc service method:
```text
status = prepared
turn count = 0
createdAt < now - 15/30 phút
→ abandoned
```

Không đếm `prepared` hoặc `abandoned` là buổi học thật trong analytics.

### 4. Data integrity turn index
Thêm unique constraint:
```sql
unique(speaking_session_id, turn_index)
```

Khi tạo turn:
- Dùng transaction.
- Tránh race khi user gửi nhiều audio gần nhau.
- Nếu conflict, retry hoặc reject rõ.

### 5. Idempotency session creation phía FE
FE cần dùng `sessionCreationPromiseRef` để không tạo nhiều session nếu user bấm mic nhiều lần.

## Acceptance Criteria
1. Vào màn speaking nhưng không bấm mic → không có session mới.
2. Bấm mic lần đầu → recording bắt đầu ngay, create session chạy song song.
3. Nhả mic → upload dùng sessionId vừa tạo.
4. Bấm mic nhiều lần → không tạo nhiều session.
5. Cancel recording → không tạo turn, session nếu có vẫn `prepared`.
6. Backend chỉ chuyển `active` khi có first turn upload thành công.
7. Prepared/abandoned không làm sai analytics.
