# Skill 03 — Frontend Speaking Screen Refactor

## Mục tiêu
Tách `speaking-session-screen.tsx` thành các hook/component nhỏ, dễ debug, dễ test, không trộn recorder/session/polling/audio/UI trong một file lớn.

## Phạm vi file
- `src/apps/web/src/features/speaking-session/components/speaking-session-screen.tsx`
- `src/apps/web/src/features/speaking-session/hooks/**`
- `src/apps/web/src/features/speaking-session/api/**`
- recorder files
- UI components liên quan conversation, mic, feedback, debug panel

## Vấn đề cần xử lý
- Screen component quá lớn.
- Có thể còn mock/dev hardcoded local audio path.
- Session creation/polling/recorder/audio player lẫn nhau.
- Debug metadata hiển thị trong production.

## Cấu trúc đề xuất
```text
features/speaking-session/
  components/
    speaking-session-screen.tsx
    session-header.tsx
    conversation-panel.tsx
    student-turn-bubble.tsx
    assistant-turn-bubble.tsx
    recorder-panel.tsx
    processing-stage-banner.tsx
    turn-feedback-panel.tsx
    debug-session-panel.tsx

  hooks/
    use-speaking-session-controller.ts
    use-session-preparation.ts
    use-recorder-controller.ts
    use-turn-upload.ts
    use-turn-status-polling.ts
    use-ai-audio-player.ts
    use-optimistic-conversation.ts

  api/
    start-session.ts
    upload-turn-audio.ts
    get-turn-status.ts
    get-turn-detail.ts
    complete-session.ts

  types/
    speaking-session.types.ts
```

## Việc cần làm

### 1. Container giữ orchestration
`speaking-session-screen.tsx` chỉ nên:
- lấy lesson/scenario props
- gọi controller hook
- render layout
- không chứa logic dài xử lý recorder/upload/polling

### 2. Tách recorder
Hook `useRecorderController`:
- start
- stop
- cancel
- error
- duration
- mimeType
- audioBlob/audioFile
- max duration nếu có

### 3. Tách session preparation
Hook `useSessionPreparation`:
- không chạy khi mount
- chỉ chạy khi user bấm mic/Start lesson
- dùng promise ref để tránh tạo nhiều session
- support `prepared` status

### 4. Tách polling/status
Hook `useTurnStatusPolling`:
- gọi endpoint `/status` nhẹ
- adaptive interval
- stop khi completed/failed
- expose stage/status/error

### 5. Optimistic UI
Khi user nhả mic:
- hiện student bubble tạm
- upload success thì status đổi processing
- có transcript thì replace bubble text
- có assistantReplyText thì render ngay
- không chờ completed mới render

### 6. Debug panel
Chỉ hiển thị khi:
```text
NEXT_PUBLIC_DEBUG_AI_FLOW=true
```
hoặc user role admin.

## Acceptance Criteria
1. `speaking-session-screen.tsx` còn dưới 250–350 dòng.
2. Không có hardcoded Windows/local audio path trong production API call.
3. Không tạo session khi mount.
4. Bấm mic start recording trước, create session chạy song song.
5. Có optimistic student bubble sau khi nhả mic.
6. FE hiển thị transcript/reply ngay khi field có, không đợi turn completed.
7. Typecheck pass.
