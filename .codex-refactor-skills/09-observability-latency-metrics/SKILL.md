# Skill 09 — Observability & Latency Metrics

## Mục tiêu
Có khả năng đo latency từng stage để biết bottleneck thật nằm ở đâu, thay vì đoán.

## Phạm vi file
- API speaking session upload/create turn
- Worker processors
- Python AI runtime
- FE trace/status UI
- session_events / ai_request_logs

## Trace fields đề xuất
Mỗi event/log nên có:
- `sessionId`
- `turnId`
- `aiRequestLogId`
- `jobId`
- `stage`
- `startedAt`
- `endedAt`
- `durationMs`
- `status`
- `errorCode`
- `errorMessage`

## Stage cần đo
Frontend:
- record_start
- record_stop
- upload_start
- upload_done
- first_status_seen
- transcript_seen
- assistant_reply_seen
- tts_ready_seen

API:
- create_session
- upload_audio_received
- upload_to_storage
- create_turn
- enqueue_ai_job
- status_query

Worker:
- job_wait_time
- download_audio
- call_ai_runtime
- write_transcript
- write_reply
- enqueue_tts
- complete_session_check

Python:
- quality_gate
- stt
- english_gate
- llm_reply
- audio_metrics
- tts
- total_process_turn

## Việc cần làm
1. Tạo helper đo duration.
2. Log structured JSON thay vì string rời rạc.
3. Không log raw audio/base64.
4. Không log secret/API key.
5. FE debug panel chỉ bật dev/admin.
6. Có endpoint/admin view sau này nếu cần.

## Acceptance Criteria
1. Mỗi turn có thể xem timeline stage.
2. Biết được p50/p95 latency từng stage bằng log.
3. Khi user báo chậm, có thể truy theo sessionId/turnId.
4. Debug trace không lộ production cho student thường.
