# Skill 07 — AI Runtime Latency Refactor

## Mục tiêu
Giảm thời gian từ lúc user upload audio đến lúc thấy assistant text. Không để TTS, deep audio metrics hoặc evaluation nặng chặn realtime reply.

## Phạm vi file
- `src/agents/services/process_turn.py`
- `src/agents/services/evaluate_session.py`
- `src/agents/tts/**`
- `src/agents/asr/**`
- `src/agents/quality/**`
- `src/agents/prompts/**`
- worker client gọi Python

## Pipeline mục tiêu
Realtime turn:
```text
quality gate
→ STT
→ English gate
→ LLM realtime reply
→ quick feedback
→ return/save transcript + assistantReplyText
```

Background:
```text
TTS
deep audio metrics
pronunciation detail
final session evaluation
```

## Việc cần làm

### 1. Tách TTS khỏi `/ai/process-turn`
Thêm option:
```json
{
  "enableTts": false
}
```

Mặc định turn realtime nên không block bởi TTS.

Tạo endpoint/job riêng nếu cần:
```text
POST /ai/generate-tts
```

### 2. Prompt realtime ngắn
Tạo:
```text
speaking_coach_realtime_prompt.md
```

Realtime prompt chỉ làm:
- giữ vai Tuki
- reply ngắn
- hỏi tiếp 1 câu
- dùng level phù hợp
- phát hiện target vocabulary
- quick feedback ngắn
- should_continue

Không làm:
- CEFR scoring đầy đủ
- lỗi ngữ pháp dài
- phân tích phát âm sâu
- report cuối buổi

### 3. Deep metrics background
Audio metrics như pitch, pause, energy, fluency detail có thể chạy sau.
Nếu vẫn cần trong turn:
- chạy parallel với LLM nếu có thể
- không để chặn assistant text

### 4. Preload ASR model
Faster-Whisper nên preload khi startup.
Thêm readiness check:
```text
/health/ready
```

### 5. Parser JSON chắc chắn
Nếu LLM có `<thought>...</thought>`, không để dính vào `json.loads`.

Cần:
- strip thought tags
- extract JSON object
- validate schema bằng Pydantic
- retry repair nếu parse fail
- log raw response có kiểm soát, không log dữ liệu nhạy cảm quá nhiều

## Acceptance Criteria
1. `/ai/process-turn` có thể trả text result mà không cần TTS.
2. LLM realtime output ngắn và parse được bằng schema.
3. `<thought>` không làm crash JSON parser.
4. ASR model warmup/readiness rõ.
5. Turn latency giảm hoặc ít nhất assistant text xuất hiện sớm hơn.
