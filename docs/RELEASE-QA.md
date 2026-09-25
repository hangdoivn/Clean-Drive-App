# Clean Drive v1.0 Release QA

Status target: `1.0.0-rc.1`

Clean Drive is considered ready for `v1.0.0` only after automated CI passes and the real-Drive smoke checklist below is completed on the Hang Đôi Google Drive account.

## Automated release gates

Every push to `main` must pass:

- `npm ci`
- `npm test`
- `npm run build`
- Vercel production deployment

The unit suite covers the safety-critical invariants:

- duplicate groups always retain one canonical copy;
- active project assets are protected;
- Source / Working / Final production roles are not default cleanup candidates;
- archive retention thresholds;
- permission risk and inherited access;
- incremental Drive change application: add, update, remove, trash and malformed changes.

## Real Drive smoke checklist

Run these in order using a disposable test folder/project where a write action is involved.

### 1. Session and sync

- [ ] Open `/clean-drive` and connect the intended Google account.
- [ ] Complete one full scan successfully.
- [ ] Hard reload the page.
- [ ] Cached metadata appears without flashing demo metrics.
- [ ] Write actions remain locked until Drive is reconnected.
- [ ] Click **Kết nối lại Drive** and confirm incremental sync returns to **Drive đã đồng bộ**.

### 2. Changes API

Create a disposable file after the full scan.

- [ ] Add a new file, sync, confirm it appears.
- [ ] Rename the file, sync, confirm metadata updates without a full re-index.
- [ ] Move the file to trash in Google Drive, sync, confirm it disappears from Clean.
- [ ] Use **Full re-index Drive** once and confirm the resulting file count is plausible.

### 3. Cleanup safety

- [ ] Active Project file cannot be selected for cleanup.
- [ ] Starred file cannot be selected.
- [ ] File not owned by the connected account cannot be selected.
- [ ] Recently modified file is protected.
- [ ] Source / RAW, Working / Edit and Final / Master are protected by default.
- [ ] Duplicate group always shows exactly one **Giữ lại** copy.
- [ ] Change duplicate canonical keeper; previous selections in that group are cleared.

### 4. Trash and Undo

Use disposable files only.

- [ ] Select one safe cleanup candidate.
- [ ] Confirmation dialog shows correct count and estimated bytes.
- [ ] Trash action succeeds.
- [ ] File is visible in Google Drive trash.
- [ ] **Khôi phục** succeeds.
- [ ] File returns to Google Drive and Clean state is consistent after sync.

### 5. Project lifecycle

- [ ] Link a Drive folder to a canonical Hang Đôi Project Core project.
- [ ] Active status protects project files.
- [ ] Delivered/archive project appears in Archive Queue when review candidates exist.
- [ ] Archive Review correctly separates Source / Working / Final / Temporary / Other.
- [ ] Retention preset persists after reload.
- [ ] Safe recoverable bytes exclude Source / Working / Final by default.

### 6. Access Audit

Use a disposable permission where revocation is tested.

- [ ] Audit all tagged project folders.
- [ ] Public write permission is shown as critical.
- [ ] Public read permission is shown as broad/high.
- [ ] Domain permission is distinguished from direct user permission.
- [ ] Inherited permission is labeled inherited and has no direct revoke action.
- [ ] Direct disposable permission can be revoked after confirmation.
- [ ] Re-audit confirms the permission is gone.

### 7. Offboarding

- [ ] Enter a test email with direct project access.
- [ ] Remaining project permissions are listed.
- [ ] Files owned by that email in the current snapshot are listed.
- [ ] Checklist does not show ready while permission/ownership remains.
- [ ] After cleanup and re-audit, checklist can reach **Có thể đóng quyền Drive**.

### 8. Mobile / iPhone

- [ ] No horizontal file-table scrolling is required.
- [ ] Category chips scroll horizontally.
- [ ] Selected cleanup plan becomes a usable sticky action dock.
- [ ] Dialogs fit viewport and can be closed.
- [ ] Main tabs remain usable.
- [ ] Google reconnect flow completes on iPhone Safari/ChatGPT external browser as applicable.

### 9. Failure recovery

- [ ] Deny/cancel Google authorization: app remains usable and shows retry state.
- [ ] Reload while cached: no write action is enabled.
- [ ] Runtime render error fallback does not claim Drive data was changed.
- [ ] Clear local metadata cache, reload, and confirm Clean returns to a safe reconnect/full-scan flow.

## Release decision

Tag `v1.0.0` only when:

1. GitHub CI is green.
2. Vercel production is green.
3. All write-action smoke tests above have passed on disposable files.
4. No unresolved P0/P1 issue can cause unintended trash, permission revocation, or misleading live/cache state.
