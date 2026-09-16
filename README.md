# fb-group-approver

CLI chạy ngầm trên Ubuntu VPS: mở trang **Thành viên đang chờ** của Facebook Group, tìm đúng người (URL profile hoặc tên), bấm **Phê duyệt**.

Không phải web app. Không commit session/cookies.

> Facebook có thể checkpoint hoặc khóa tài khoản nếu phát hiện automation. Chỉ dùng session admin của chính bạn, chạy chậm, không spam.

## 1. Cài môi trường trên Ubuntu Server

SSH vào VPS (Tailscale):

```bash
ssh edward@100.125.150.56
```

Clone và cài gói hệ thống + Node 22:

```bash
cd ~
git clone https://github.com/weiyuanwen/fb-group-approver.git
cd fb-group-approver
bash scripts/install-ubuntu.sh
```

Cài dependency Node (Puppeteer tự tải Chrome):

```bash
npm install
cp .env.example .env
nano .env   # điền FB_GROUP_ID
```

Kiểm tra môi trường:

```bash
node -v          # >= 20
npm -v
bash scripts/check-env.sh
```

`check-env.sh` phải in `OK Chrome ...`. Nếu thiếu lib, chạy lại `install-ubuntu.sh`.

## 2. Session Facebook (tránh checkpoint)

Không đăng nhập bằng email/mật khẩu trên VPS. Lấy profile Chrome đã login sẵn trên máy cá nhân, copy lên server.

### Máy Mac (một lần)

```bash
cd /Users/edward/Documents/GitHub/fb-group-approver
npm install
cp .env.example .env
npm run login
```

Chrome sẽ mở `facebook.com`. Đăng nhập **tài khoản admin nhóm**, xử lý checkpoint nếu có, đợi vào news feed, quay lại terminal **Enter**.

Session nằm ở `data/chrome-profile/` (đã gitignore).

Đóng hết Chrome/Chromium đang dùng profile đó, rồi copy lên VPS:

```bash
rsync -avz --delete \
  ./data/chrome-profile/ \
  edward@100.125.150.56:~/fb-group-approver/data/chrome-profile/
```

Trên VPS:

```bash
ls ~/fb-group-approver/data/chrome-profile | head
bash scripts/check-env.sh
```

Phải thấy `OK có userDataDir`.

## 3. Duyệt thành viên

Trên VPS, trong thư mục project:

```bash
# Theo URL profile
node src/approve.js --member "https://www.facebook.com/username"

# Theo tên đang hiện trong danh sách chờ
node src/approve.js --member "Nguyễn Văn A"

# Ghi đè group id
node src/approve.js --group 123456789 --member "Nguyễn Văn A"
```

Thành công:

```
[ok] Đã bấm Phê duyệt.
```

Thất bại (không thấy người / chưa login / checkpoint):

```
[fail] Không duyệt được thành viên.
[fail] Lý do: ...
[fail] Ảnh: data/screenshots/...
```

Ảnh debug nằm ở `data/screenshots/`.

Chạy có cửa sổ ảo (debug trên VPS):

```bash
xvfb-run -a node src/approve.js --headed --member "Nguyễn Văn A"
```

## 4. Tắt phê duyệt bài viết (sau thanh toán)

Tiệm Nhà Duy gọi HTTP khi CK khớp. Chạy API trên VPS (không public):

```
FB_APPROVER_PORT=4001
FB_APPROVER_TOKEN=...   # cùng giá trị Laravel FB_APPROVER_TOKEN
npm run serve
```

Laravel: `FB_APPROVER_URL=http://host.docker.internal:4001`.

CLI:

```
node src/disable-post-approval.js "https://www.facebook.com/username"
```

Nếu thành viên đang **bật** phê duyệt bài viết thì script bấm **Tắt**. Nếu đang tắt sẵn thì trả `already_off` (vẫn coi là thành công).

## Cấu hình `.env`

```
FB_GROUP_ID=123456789
FB_USER_DATA_DIR=./data/chrome-profile
FB_APPROVER_PORT=4001
FB_APPROVER_TOKEN=
```

`FB_GROUP_ID` là số trên URL `facebook.com/groups/<id>`.

## Lệnh nhanh

| Lệnh | Việc |
| --- | --- |
| `bash scripts/install-ubuntu.sh` | Node + lib Chrome trên Ubuntu |
| `bash scripts/check-env.sh` | Kiểm tra Node / lib / Chrome / session |
| `npm run login` | Login trên máy cá nhân, lưu profile |
| `node src/approve.js --member "..."` | Duyệt 1 người đang chờ |
| `npm run serve` | HTTP tắt phê duyệt bài viết cho Laravel |
| `npm run disable-post-approval -- "<url>"` | Tắt phê duyệt 1 thành viên |
