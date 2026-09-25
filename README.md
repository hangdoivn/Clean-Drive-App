# Hang Đôi Apps

App hub cho hệ thống nội bộ tại `app.hangdoistudio.vn`.

## Routes

- `/` — Hang Đôi Apps Hub
- `/clean-drive` — Clean Drive
- Các app tiếp theo được thêm như module độc lập và đăng ký tại Hub.

## Clean Drive

Clean Drive là ý tưởng ứng dụng giúp người dùng hiểu thứ gì đang chiếm dung lượng Google Drive, tìm file trùng/lâu không dùng và dọn chúng theo cách an toàn.

## Chạy web app

```bash
npm install
cp .env.example .env.local
npm run dev
```

Không có OAuth Client ID, app vẫn mở ở chế độ mô phỏng để thử toàn bộ luồng chọn và dọn file. Để kết nối Drive thật, tạo OAuth 2.0 Client ID loại **Web application**, thêm origin chạy app vào Authorized JavaScript origins và điền `VITE_GOOGLE_CLIENT_ID` trong `.env.local`.

## Kết luận nghiên cứu

Nên làm MVP dưới dạng web app **local-first**:

- Đăng nhập và xin quyền bằng Google Identity Services.
- Gọi Google Drive API trực tiếp từ trình duyệt.
- Không gửi metadata, tên file hoặc access token về server của ứng dụng.
- Chỉ quét metadata; không tải nội dung file về để phân tích.
- Mặc định chỉ đề xuất. Người dùng phải chọn rõ file trước khi đưa vào thùng rác.
- Không hỗ trợ xóa vĩnh viễn ở MVP.

Rào cản lớn nhất không phải thuật toán mà là OAuth. Một app dọn **toàn bộ** Drive cần scope rộng để thấy metadata của các file hiện có. `drive.file` không đủ vì scope này chỉ truy cập các file người dùng chủ động mở/chia sẻ với app.

## MVP đề xuất

1. Tổng quan dung lượng Drive và dung lượng đang nằm trong thùng rác.
2. File lớn nhất do người dùng sở hữu.
3. File nhị phân trùng chính xác theo `md5Checksum + size`.
4. File cũ/lâu không mở, với tiêu chí do người dùng điều chỉnh.
5. Folder rỗng.
6. Danh sách bảo vệ mặc định: file được gắn sao, file mới sửa gần đây, file không thuộc sở hữu của người dùng và file không có quyền đưa vào thùng rác.
7. Preview số file và dung lượng có thể giải phóng trước khi hành động.
8. Đưa vào thùng rác theo lô nhỏ, có báo cáo thành công/thất bại và khả năng hoàn tác bằng cách khôi phục.

Không nên đưa vào MVP: xóa vĩnh viễn, tải/đọc nội dung tài liệu, AI phân loại nội dung, dọn Shared Drive hoặc chạy nền định kỳ.

## Tài liệu

- [Nghiên cứu sản phẩm và kỹ thuật](docs/RESEARCH.md)

## Bước triển khai đề xuất

- Giai đoạn 1: prototype chỉ đọc, chạy với danh sách test users trong Google Cloud.
- Giai đoạn 2: thêm incremental authorization cho thao tác đưa vào thùng rác.
- Giai đoạn 3: hoàn thiện privacy policy, trang chủ công khai và hồ sơ OAuth verification trước khi mở cho người dùng bên ngoài.
