# Codex Refactor Skills — TurTalk AI Speaking

Bộ skills này dùng để giao việc cho Codex refactor repo theo từng phase.

## Cách dùng
Copy thư mục này vào repo, ví dụ:

```text
.codex/skills/refactor/
```

Khi giao task cho Codex, dùng format:

```text
Hãy áp dụng Skill 01 — Security Hardening.
Chỉ sửa trong phạm vi skill.
Không làm sang phase khác.
Sau khi sửa, báo:
1. File đã sửa
2. Lý do sửa
3. Cách test
4. Risk còn lại
```

## Thứ tự khuyến nghị
1. `01-security-hardening`
2. `02-session-lifecycle-data-integrity`
3. `03-frontend-speaking-screen-refactor`
4. `04-audio-pipeline-webm-opus`
5. `05-turn-status-optimistic-ui`
6. `06-worker-queue-refactor`
7. `07-ai-runtime-latency-refactor`
8. `08-final-evaluation-reliability`
9. `09-observability-latency-metrics`
10. `10-cleanup-tests-docs`

## Nguyên tắc
- Không rewrite toàn bộ.
- Không làm nhiều phase trong một PR.
- Commit nhỏ.
- Build/typecheck sau mỗi phase.
- Manual test theo acceptance criteria.
