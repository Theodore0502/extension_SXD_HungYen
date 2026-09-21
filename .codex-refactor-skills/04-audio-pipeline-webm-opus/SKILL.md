# Skill 04 — Audio Pipeline: WAV to WebM/Opus

## Mục tiêu
Giảm latency upload/download/storage bằng cách chuyển browser recorder từ WAV/PCM sang WebM/Opus, nhưng vẫn giữ fallback an toàn nếu browser không hỗ trợ.

## Phạm vi file
- `src/apps/web/src/features/speaking-session/browser-wav-recorder.ts`
- recorder hooks/components
- upload API client
- `src/apps/api/src/modules/speaking-sessions/**`
- media/storage service
- worker audio resolver/downloader
- `src/agents/asr/**`

## Việc cần làm

### 1. Tạo recorder mới dùng MediaRecorder
Tên đề xuất:
```text
browser-media-recorder.ts
```

Logic chọn MIME:
```ts
const preferredMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/wav",
];
```

Chọn MIME đầu tiên mà `MediaRecorder.isTypeSupported()` trả true.

### 2. Không hardcode `.wav`
Backend storage path không được là:
```text
input.wav
```

Đổi thành:
```text
input.{ext}
```

Mapping:
- `audio/webm` → `webm`
- `audio/webm;codecs=opus` → `webm`
- `audio/wav` → `wav`
- `audio/mpeg` → `mp3`
- `audio/mp4` → `mp4`

### 3. Lưu metadata audio
Nếu schema đã có `MediaAsset`, lưu:
- `mimeType`
- `extension`
- `sizeBytes`
- `durationSec` nếu tính được
- `storageBucket`
- `storagePath`

### 4. Worker/Python tương thích WebM
- Worker không assume `.wav`.
- Python/faster-whisper phải nhận path webm.
- Container/runtime phải có `ffmpeg`.

### 5. Fallback
Nếu browser không hỗ trợ WebM/Opus:
- dùng fallback hiện tại WAV
- vẫn lưu đúng metadata
- không crash

## Acceptance Criteria
1. Chrome/Edge record ra WebM/Opus.
2. API upload accept `audio/webm`.
3. Supabase lưu path `input.webm`.
4. Worker tải đúng file.
5. Python transcribe được WebM.
6. Fallback WAV vẫn chạy nếu WebM không hỗ trợ.
7. Không còn code hardcode `input.wav` ở production path.
