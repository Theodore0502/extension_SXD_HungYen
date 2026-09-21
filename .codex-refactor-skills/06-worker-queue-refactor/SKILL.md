# Skill 06 — Worker & Queue Refactor

## Mục tiêu
Tách worker lớn thành các service nhỏ, tránh queue realtime bị block bởi TTS/evaluation, tăng idempotency và debug.

## Phạm vi file
- `src/apps/worker/src/infrastructure/queue/ai-reply.worker.ts`
- evaluate-session worker nếu có
- queue module/config
- API enqueue logic
- Prisma models liên quan ai_request_logs/session_events/feedback_reports

## Cấu trúc đề xuất
```text
src/apps/worker/src/
  processors/
    ai-turn.processor.ts
    tts.processor.ts
    session-evaluation.processor.ts

  clients/
    ai-runtime.client.ts
    supabase-storage.client.ts

  services/
    turn-input-builder.ts
    audio-file-resolver.ts
    turn-result-writer.ts
    session-completion-policy.ts
    session-event-writer.ts
    evaluation-report-writer.ts

  queues/
    queue-names.ts
    queue-options.ts
```

## Queue đề xuất
- `ai-turn.queue`: priority cao nhất
- `ai-tts.queue`: priority trung bình
- `ai-evaluate-session.queue`: priority thấp

## Nguyên tắc
1. Realtime turn không chờ evaluation cuối buổi.
2. TTS không chặn assistant text.
3. Worker process function càng mỏng càng tốt.
4. Mọi job phải có `jobId` deterministic nếu cần idempotency.

## Idempotency đề xuất
- Turn job:
  ```text
  jobId = ai-turn:{aiRequestLogId}
  ```
- TTS job:
  ```text
  jobId = ai-tts:{turnId}
  ```
- Evaluation job:
  ```text
  jobId = evaluate-session:{sessionId}
  ```

## Error handling
Nếu AI turn fail:
- update ai_request_log status failed
- update turn feedback/error snapshot
- ghi session event
- FE status endpoint trả failed rõ

Nếu evaluation fail:
- tạo/upsert feedback report `failed`
- không để feedback page polling vô hạn

## Acceptance Criteria
1. `ai-reply.worker.ts` không còn là file khổng lồ.
2. Turn realtime queue không bị block bởi evaluation.
3. TTS chạy queue riêng hoặc ít nhất không nằm trong critical path.
4. Job retry không tạo duplicate report/duplicate events nghiêm trọng.
5. Có log chứa `sessionId`, `turnId`, `aiRequestLogId`, `jobId`.
