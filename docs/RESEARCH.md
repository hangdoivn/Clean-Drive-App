# Nghiên cứu app Clean Google Drive

Cập nhật: 25/09/2026

## 1. Bài toán nên giải

Người dùng không cần thêm một file manager chung chung. Giá trị chính của sản phẩm là trả lời nhanh ba câu hỏi:

1. Thứ gì đang chiếm nhiều dung lượng?
2. Thứ gì có khả năng xóa an toàn?
3. Nếu dọn, chính xác bao nhiêu dung lượng sẽ được giải phóng?

Định vị phù hợp: **trợ lý dọn Drive có kiểm soát**, không phải công cụ tự động xóa.

## 2. Phạm vi MVP

### Các nhóm đề xuất

| Nhóm | Cách phát hiện | Độ tin cậy | Hành vi mặc định |
| --- | --- | --- | --- |
| File lớn | `quotaBytesUsed` hoặc `size`, chỉ file `ownedByMe` | Cao | Sắp xếp giảm dần |
| File trùng chính xác | Cùng `md5Checksum` và `size` | Cao với file nhị phân | Giữ file mới nhất, chỉ đề xuất các bản còn lại |
| File cũ | `modifiedTime` cũ hơn ngưỡng do người dùng chọn | Trung bình | Không tự chọn |
| Lâu không mở | `viewedByMeTime` cũ hơn ngưỡng; nếu thiếu thì hiển thị “không rõ” | Trung bình | Không tự chọn |
| Folder rỗng | Không có file nào tham chiếu folder đó trong `parents` | Cao sau khi quét đủ | Chỉ đề xuất folder do người dùng sở hữu |
| Thùng rác | `storageQuota.usageInDriveTrash` và `trashed=true` | Cao | Chỉ hiển thị, không empty trash ở MVP |

### Hạn chế quan trọng của phát hiện file trùng

`md5Checksum` chỉ áp dụng cho file có nội dung nhị phân. Google Docs, Sheets và Slides dạng native không có checksum này. Vì vậy:

- Không gọi các file native là “trùng chính xác” chỉ vì cùng tên hoặc cùng kích thước.
- Có thể thêm nhóm “có vẻ trùng” theo tên/loại/thời gian ở phiên bản sau, nhưng phải ghi rõ đây là heuristic.
- Không tải và export toàn bộ tài liệu chỉ để hash trong MVP; việc đó tốn quota, tăng rủi ro dữ liệu và có thể làm người dùng hiểu sai quyền mà app cần.

## 3. Quyền OAuth: quyết định quan trọng nhất

### Vì sao `drive.file` không đủ

Google khuyến nghị `drive.file` cho phần lớn ứng dụng vì đây là scope không nhạy cảm và chỉ cấp quyền theo từng file. Tuy nhiên nó chỉ cho phép app làm việc với file do app tạo hoặc file người dùng chủ động mở/chia sẻ với app. Một trình dọn Drive toàn cục phải thấy metadata của các file đã tồn tại, nên không thể thực hiện đúng chức năng chỉ với `drive.file`.

### Scope theo giai đoạn

| Thời điểm | Scope | Mục đích |
| --- | --- | --- |
| Scan | `https://www.googleapis.com/auth/drive.metadata.readonly` | Đọc metadata toàn Drive để phân tích |
| Dọn | `https://www.googleapis.com/auth/drive` | Đặt `trashed=true` cho file đã được người dùng xác nhận |

Cả hai đều là restricted scopes theo tài liệu Google hiện tại. Nên xin quyền tăng dần: app chỉ xin quyền đọc khi scan; chỉ xin quyền quản lý khi người dùng bấm dọn.

Nếu sản phẩm công khai cho người dùng Google bên ngoài, cần chuẩn bị OAuth restricted-scope verification. Nếu dữ liệu restricted được lưu hoặc truyền qua server bên thứ ba, Google yêu cầu security assessment định kỳ. Mô hình chạy hoàn toàn trong trình duyệt giúp giảm bề mặt dữ liệu và có thể tránh yêu cầu assessment gắn với việc dữ liệu đi qua server, nhưng không loại bỏ bước xác minh restricted scope cho bản production công khai.

Trong giai đoạn development/testing, có thể dùng danh sách test users. Ứng dụng chưa được xác minh có user cap và cảnh báo; đây không phải mô hình phát hành lâu dài.

## 4. Kiến trúc khuyến nghị

### MVP local-first

```text
Người dùng
   │
   ├─ Google Identity Services ──> access token ngắn hạn
   │
   └─ Web app trong trình duyệt
          │
          ├─ GET Drive metadata trực tiếp từ Google
          ├─ phân nhóm và tính dung lượng trong Web Worker
          ├─ lưu tùy chọn cục bộ trong IndexedDB
          └─ PATCH file đã chọn thành trashed=true
```

Nguyên tắc:

- Không có database chứa tên file, file ID hoặc token.
- Không có analytics ghi lại tên/file ID.
- Access token chỉ nằm trong memory; khi hết hạn, người dùng thực hiện lại gesture để cấp token.
- Dùng Web Worker cho việc group/sort nhiều nghìn file để UI không bị treo.
- IndexedDB chỉ lưu cấu hình không nhạy cảm và cache tùy chọn; metadata scan nên xóa khi sign out/đóng phiên nếu không thực sự cần cache.

Google Identity Services token model trả access token cho browser và không cần lưu refresh token ở backend. Đổi lại, access token có tuổi thọ ngắn và người dùng có thể phải cấp lại quyền sau khi hết hạn. Đây là trade-off tốt cho MVP dọn theo phiên.

### Stack

- React + TypeScript + Vite cho SPA tĩnh.
- Google Identity Services (`google.accounts.oauth2.initTokenClient`).
- Drive REST API v3 gọi trực tiếp bằng `fetch`.
- Web Worker cho index và duplicate grouping.
- Vitest cho rule engine; Playwright cho luồng UI với API mock.
- Hosting tĩnh trên domain đã xác minh quyền sở hữu.

Không cần Next.js/backend cho MVP. Chỉ thêm backend khi có nhu cầu chạy nền, nhiều thiết bị hoặc lịch sử dài hạn; lúc đó phải thiết kế lại token storage, mã hóa, data deletion và security assessment.

## 5. Thiết kế API

### Lấy quota

`about.get` với field mask:

```text
storageQuota(limit,usage,usageInDrive,usageInDriveTrash),user(displayName,emailAddress,photoLink)
```

Lưu ý: với tổ chức dùng pooled storage, limit/usage có thể phản ánh cả tổ chức thay vì riêng người dùng.

### Quét file

`files.list`:

```text
q=trashed=false
spaces=drive
corpora=user
pageSize=1000
fields=nextPageToken,incompleteSearch,files(
  id,name,mimeType,size,quotaBytesUsed,md5Checksum,
  createdTime,modifiedTime,viewedByMeTime,
  parents,ownedByMe,starred,trashed,
  capabilities/canTrash,webViewLink
)
```

Yêu cầu kỹ thuật:

- Theo `nextPageToken` cho đến hết; không giả định một response là đầy đủ.
- Nếu `incompleteSearch=true`, báo scan chưa hoàn chỉnh thay vì đưa kết luận sai.
- Dùng `fields` để tránh lấy dữ liệu không cần thiết.
- Dùng `corpora=user`; Google khuyến nghị `user` hoặc một `drive` cụ thể thay vì `allDrives` vì hiệu năng.
- Không đưa Shared Drive vào MVP. File trong Shared Drive không có `ownedByMe` theo cùng nghĩa và quyền dọn phức tạp hơn.

### Đưa vào thùng rác

Trước mỗi batch:

1. Chỉ nhận ID có trong snapshot scan hiện tại.
2. Yêu cầu `ownedByMe=true` và `capabilities.canTrash=true`.
3. Loại file starred, file mới sửa gần đây và mọi mục trong danh sách bảo vệ mặc định trừ khi người dùng bỏ bảo vệ rõ ràng.
4. Hiển thị tổng số file và dung lượng ước tính.
5. Gửi `files.update(fileId, { trashed: true })` theo batch nhỏ, giới hạn concurrency.
6. Với 403/429/5xx, retry bằng truncated exponential backoff; không retry vô hạn.
7. Trả báo cáo theo từng file và nút khôi phục bằng `trashed=false` trong phiên hiện tại.

Google cho biết file trong thùng rác có thể khôi phục trong 30 ngày trước khi tự động bị xóa. Chỉ owner mới có thể trash file trong My Drive; cần kiểm tra `ownedByMe` để tránh lỗi quyền.

## 6. Luồng trải nghiệm

1. Landing page giải thích rõ: app chỉ đọc metadata, không đọc nội dung.
2. “Kết nối Google Drive” → xin quyền metadata read-only.
3. Progress theo số page/file đã quét; cho phép cancel.
4. Dashboard hiển thị quota và các nhóm đề xuất.
5. Người dùng review từng nhóm, preview link gốc trên Drive và chọn file.
6. Trang xác nhận cuối cùng: số file, dung lượng ước tính, quy tắc bảo vệ đang áp dụng.
7. Khi bấm “Đưa vào thùng rác”, xin quyền write tăng dần.
8. Thực hiện batch, hiển thị từng lỗi có thể xử lý và nút khôi phục.

Ngôn từ UI nên dùng “Đưa vào thùng rác”, không dùng “Xóa”, để không tạo hiểu nhầm.

## 7. Mô hình dữ liệu trong phiên

```ts
type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  quotaBytesUsed?: string;
  md5Checksum?: string;
  createdTime?: string;
  modifiedTime?: string;
  viewedByMeTime?: string;
  parents?: string[];
  ownedByMe?: boolean;
  starred?: boolean;
  capabilities?: { canTrash?: boolean };
  webViewLink?: string;
};
```

Các giá trị byte là `int64` dạng string trong JSON; nên chuyển sang `bigint`, không dùng `number` một cách mù quáng.

## 8. Các rule an toàn bắt buộc

- Không xóa vĩnh viễn trong MVP.
- Không tự chọn trước file theo heuristic “cũ” hoặc “lâu không mở”.
- Không đụng file không thuộc sở hữu của người dùng.
- Không coi cùng tên là file trùng chính xác.
- Không dọn Shared Drive trong MVP.
- Không thực hiện thao tác nếu scan chưa hoàn chỉnh.
- Không ghi file ID/name vào telemetry hoặc error tracker.
- Hiển thị rõ ước tính dung lượng; `quotaBytesUsed` có thể bao gồm revision được giữ vĩnh viễn.
- Sau thao tác, đọc lại trạng thái/quota thay vì giả định thay đổi hiển thị ngay lập tức.

## 9. Quota và hiệu năng

Theo tài liệu cập nhật từ 01/05/2026, Drive API tính quota theo đơn vị: thao tác list đắt hơn get, và read/edit/download có chi phí khác nhau. Vì vậy:

- Quét bằng `files.list` page size 1000, không gọi `files.get` cho từng file.
- Chỉ lấy field cần thiết.
- Không download nội dung.
- Giới hạn concurrency thao tác update.
- Xử lý 403 rate limit và 429 bằng exponential backoff có jitter.
- Sau lần scan đầu, nếu sau này cần đồng bộ dài hạn, dùng Changes API thay vì quét toàn bộ lại. MVP theo phiên chưa cần Changes API.

## 10. Phát hành và compliance

Checklist trước production:

- Tách Google Cloud project test và production.
- Trang chủ công khai trên domain sở hữu.
- Privacy Policy cùng domain, mô tả chính xác dữ liệu truy cập, sử dụng, lưu trữ và chia sẻ.
- Terms và kênh support.
- OAuth consent screen, brand verification và restricted-scope justification.
- Video demo toàn bộ luồng xin quyền và cách mỗi scope được dùng.
- Cam kết Google API Services User Data Policy/Limited Use.
- Quy trình revoke access và xóa dữ liệu cục bộ.
- Nếu thêm backend nhận restricted data: đánh giá lại nghĩa vụ CASA/security assessment hằng năm.

## 11. Chỉ số sản phẩm

Không thu thập tên/file ID. Chỉ số aggregate có thể đo với consent:

- Tỷ lệ kết nối Drive thành công.
- Thời gian scan và số file theo bucket, không kèm định danh.
- Tỷ lệ từ scan → review → trash.
- Dung lượng giải phóng theo bucket tổng hợp.
- Tỷ lệ khôi phục sau khi trash.
- Tỷ lệ lỗi theo HTTP code/Drive reason đã được loại bỏ dữ liệu file.

North-star phù hợp: **dung lượng được người dùng chủ động giải phóng an toàn**, kèm guardrail là tỷ lệ khôi phục và tỷ lệ lỗi.

## 12. Lộ trình

### Tuần 1: prototype read-only

- OAuth test project và test users.
- Quota card, full pagination scan, large files, exact duplicates.
- Rule engine thuần TypeScript và fixture tests.

### Tuần 2: review và safety

- Old/unviewed/empty-folder groups.
- Search/filter/sort, protected rules, selection summary.
- Mocked e2e tests cho scan lớn, token hết hạn và incomplete search.

### Tuần 3: trash workflow

- Incremental write authorization.
- Batch update, retry/backoff, per-file status và undo.
- Privacy/telemetry audit.

### Sau MVP

- Changes API để incremental scan.
- PWA/offline shell.
- Heuristic “có vẻ trùng” cho Google-native files, luôn yêu cầu review.
- Shared Drive chỉ khi có nhu cầu thật và sau khi thiết kế lại permission model.

## 13. Nguồn chính thức

- [Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Search for files and folders](https://developers.google.com/workspace/drive/api/guides/search-files)
- [files.list reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)
- [File resource fields](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- [About/storage quota fields](https://developers.google.com/workspace/drive/api/reference/rest/v3/about)
- [Trash or delete files](https://developers.google.com/workspace/drive/api/guides/delete)
- [Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [Drive API error handling](https://developers.google.com/workspace/drive/api/guides/handle-errors)
- [Fields/partial responses](https://developers.google.com/workspace/drive/api/guides/fields-parameter)
- [Changes API](https://developers.google.com/workspace/drive/api/guides/about-changes)

