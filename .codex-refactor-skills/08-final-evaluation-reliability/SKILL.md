# Skill 08 — Final Evaluation Reliability

## Mục tiêu
Làm evaluation cuối buổi đáng tin cậy, không làm treo feedback page, và dùng đúng dữ liệu toàn session.

## Phạm vi file
- `src/apps/worker/src/**evaluate**`
- `src/agents/services/evaluate_session.py`
- `src/agents/prompts/speaking_evaluator_prompt.md`
- feedback API/module
- feedback summary frontend screen

## Vấn đề cần sửa
- Nếu evaluation fail, frontend không được polling mãi.
- Evaluation cuối buổi không nên block turn realtime queue.
- Evaluator cần dùng dữ liệu đủ: scenario, transcript, target vocabulary, turn feedback, audio metrics nếu có.
- Nếu source hiện tại chỉ heuristic, cần nâng cấp theo schema rõ.

## Evaluation payload đề xuất
```json
{
  "session": {
    "id": "session-id",
    "languageLevel": "A1",
    "targetLevel": "A2",
    "scenario": {},
    "targetVocabulary": [],
    "targetPatterns": [],
    "startedAt": "...",
    "completedAt": "..."
  },
  "turns": [
    {
      "turnIndex": 1,
      "studentTranscript": "...",
      "assistantReply": "...",
      "sttConfidence": 0.82,
      "detectedEntities": [],
      "quickFeedback": "...",
      "audioMetrics": {}
    }
  ]
}
```

## Output schema đề xuất
```json
{
  "status": "ready",
  "overallScore": 78,
  "rubricScores": {
    "relevance": 80,
    "grammar": 70,
    "vocabulary": 75,
    "pronunciation": 72,
    "fluency": 68
  },
  "strengths": [],
  "mistakes": [],
  "nextPractice": [],
  "summary": "..."
}
```

## Error handling bắt buộc
Nếu Python/LLM fail:
- upsert FeedbackReport:
  - `status = failed`
  - `overallScore = null` hoặc `0` theo UI contract
  - message thân thiện
- ghi event `EVALUATION_FAILED`
- frontend hiển thị lỗi rõ, không spinner vô hạn

## Idempotency
Evaluation job:
```text
jobId = evaluate-session:{sessionId}
```

Report write:
- upsert theo `sessionId`
- không tạo nhiều report duplicate

## Acceptance Criteria
1. Complete session xong → feedback page vào được ngay, hiển thị pending/generating.
2. Evaluation success → report ready.
3. Evaluation fail → report failed, UI dừng polling.
4. Retry job không tạo duplicate report.
5. Evaluation không block `ai-turn.queue`.
