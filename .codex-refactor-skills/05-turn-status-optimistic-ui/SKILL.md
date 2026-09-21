# Skill 05 — Turn Status Endpoint, Adaptive Polling & Optimistic UI

## Mục tiêu
Giảm latency cảm nhận bằng endpoint polling nhẹ, UI hiển thị từng phần, và stage status rõ ràng.

## Phạm vi file
- `src/apps/api/src/modules/speaking-sessions/**`
- `src/apps/web/src/features/speaking-session/hooks/**`
- `src/apps/web/src/features/speaking-session/components/**`
- worker update stage nếu cần
- Prisma schema nếu cần thêm field

## Endpoint đề xuất
```text
GET /speaking-sessions/:sessionId/turns/:turnId/status
```

Response nhẹ:
```json
{
  "sessionId": "xxx",
  "turnId": "yyy",
  "status": "processing",
  "stage": "generating_reply",
  "transcriptText": "I like football.",
  "assistantReplyText": null,
  "feedbackSnapshot": null,
  "ttsStatus": "pending",
  "ttsAudioUrl": null,
  "error": null
}
```

## Không được trả trong endpoint status
- Full session.
- Full conversation history.
- Full feedback report.
- TTS base64.
- Admin/debug metadata.
- Raw ai_request_logs inputPayload lớn.

## Stage đề xuất
- `queued`
- `upload_received`
- `transcribing`
- `transcribed`
- `checking_english`
- `generating_reply`
- `reply_generated`
- `generating_feedback`
- `feedback_generated`
- `generating_tts`
- `tts_generated`
- `completed`
- `failed`

## FE polling adaptive
- queued: 500ms
- processing: 700–1000ms
- completed/failed: stop
- timeout UI nếu quá lâu nhưng không tự đánh failed nếu backend chưa failed

## Optimistic UI
Khi user nhả mic:
1. Thêm student bubble tạm: "Uploading your answer..."
2. Upload success: "Processing your answer..."
3. Có `transcriptText`: thay bằng transcript thật.
4. Thêm assistant bubble tạm: "Tuki is thinking..."
5. Có `assistantReplyText`: thay bằng reply thật.
6. Có `ttsAudioUrl`: hiện nút play.

## Acceptance Criteria
1. Polling endpoint query ít field.
2. FE không poll endpoint detail nặng trong lúc chờ.
3. Assistant text hiện ngay khi có `assistantReplyText`.
4. TTS không làm endpoint status phình to.
5. Failed state hiển thị rõ, không spinner vô hạn.
6. Stage message thân thiện với học sinh.
