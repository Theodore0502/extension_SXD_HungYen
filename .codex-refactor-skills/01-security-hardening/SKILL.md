# Skill 01 — Security Hardening

## Mục tiêu
Vá các lỗi security nghiêm trọng trước khi refactor latency hoặc UI.

## Phạm vi file cần kiểm tra
- `src/apps/web/src/features/auth/**`
- `src/apps/web/src/lib/schemas.ts`
- `src/apps/api/src/modules/auth/**`
- `src/apps/api/src/modules/speaking-sessions/**`
- `src/apps/api/src/infrastructure/supabase/**`
- `src/agents/api.py`
- Các DTO liên quan audio input, session turn, upload

## Việc cần làm

### 1. Chặn tự đăng ký role admin
Tìm mọi nơi client gửi role khi signup/register.

Yêu cầu:
- Self-register chỉ được phép `student` hoặc `parent`.
- Tuyệt đối không nhận `admin` từ `user_metadata`.
- Backend không được tin role từ request client.
- Admin chỉ được tạo bằng seed script, invite nội bộ, hoặc app_metadata do service role set.

Checklist:
- [ ] `register.ts` không cho chọn/gửi role `admin`.
- [ ] schema validation không cho self-register role admin.
- [ ] `auth.service.ts` map role an toàn.
- [ ] Nếu role không hợp lệ, default về `student` hoặc reject.
- [ ] Có test/manual test: sửa request role=`admin` vẫn không tạo được admin.

### 2. Vô hiệu hóa `local_path` trong production
Tìm DTO hoặc endpoint cho phép:
```json
{
  "audioInput": {
    "source": "local_path",
    "path": "..."
  }
}
```

Yêu cầu:
- Production không cho user gửi local file path.
- Nếu cần giữ dev flow, bọc bằng env flag:
  - `ALLOW_LOCAL_AUDIO_PATH=true`
  - chỉ dùng local/dev
- Endpoint public/student không được đọc file từ path user cung cấp.

Checklist:
- [ ] `local_path` bị reject ở production.
- [ ] Có error message rõ.
- [ ] Worker không đọc path tùy ý từ user payload.
- [ ] Manual test gửi `/etc/passwd`, `C:\Windows\...`, `.env` đều bị reject.

### 3. Thêm auth cho Python AI Runtime
File trọng tâm:
- `src/agents/api.py`
- worker client gọi Python runtime

Yêu cầu:
- Các endpoint `/ai/process-turn`, `/ai/evaluate-session`, `/ai/generate-tts` nếu có phải yêu cầu internal API key.
- Header đề xuất: `X-Internal-Api-Key`.
- Worker gửi key từ env.
- Python reject nếu thiếu/sai key.
- Health check public chỉ nên trả thông tin tối thiểu.

Checklist:
- [ ] Thêm env `AI_RUNTIME_INTERNAL_API_KEY`.
- [ ] Worker gửi header.
- [ ] Python dependency/middleware validate header.
- [ ] Không log key.
- [ ] Manual test curl không key → 401/403.

### 4. Giới hạn upload audio
File trọng tâm:
- speaking sessions controller
- upload endpoint
- media/storage service

Yêu cầu:
- Giới hạn file size.
- Allowlist MIME.
- Reject file rỗng.
- Không hardcode `input.wav`.
- Lưu `mimeType`, `extension`, `sizeBytes`.

MIME đề xuất:
- `audio/webm`
- `audio/webm;codecs=opus`
- `audio/wav`
- `audio/mpeg`
- `audio/mp4`

Checklist:
- [ ] File > limit bị reject.
- [ ] File không phải audio bị reject.
- [ ] File rỗng bị reject.
- [ ] Upload response có error rõ.

## Acceptance Criteria
1. Không thể tự tạo admin bằng request signup.
2. Không thể ép backend/worker đọc local file tùy ý.
3. Python AI runtime không callable nếu thiếu internal key.
4. Upload audio có size/mime validation.
5. Build/typecheck pass.
