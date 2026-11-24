# ChatNET

Ứng dụng nhắn tin ngang hàng (peer-to-peer) cho Android, viết bằng React Native. Hai điện thoại trong cùng mạng WiFi
nhắn tin và gửi ảnh trực tiếp cho nhau qua TCP, không cần máy chủ trung gian. Nội dung được mã hóa trước khi gửi.

## Tính năng

- Nhắn tin văn bản hai chiều qua TCP (cổng `8888`), hỗ trợ tiếng Việt có dấu và emoji.
- Gửi ảnh chọn từ thư viện (tối đa 10 MB), có kiểm tra checksum để phát hiện dữ liệu hỏng.
- Bốn phương pháp mã hóa: AES, DES, Caesar và "RSA" (xem mục [Mã hóa](#mã-hóa)).
- Đặt tên người dùng, tên hiển thị trên tin nhắn của bên nhận.
- Tự hủy tin nhắn sau 5, 10, 30 hoặc 60 giây.
- Hiển thị địa chỉ IP của máy để bên kia nhập vào.
- Báo lỗi rõ ràng khi không kết nối được hoặc khi hai bên dùng sai key.

## Cài đặt và sử dụng

### Cài APK

1. Chép file `ChatNET.apk` sang điện thoại Android 7.0 trở lên.
2. Mở file để cài (cho phép "Cài ứng dụng không rõ nguồn gốc" nếu được hỏi).

### Nhắn tin giữa hai máy

1. Cho hai điện thoại vào **cùng một mạng WiFi**.
2. Mở ChatNET trên cả hai máy, bấm biểu tượng ⚙️ để vào **Cài đặt**.
3. Mỗi máy nhập **IP của máy kia** vào ô "IP người nhận" (IP của mỗi máy hiện ở mục "Địa chỉ IP của bạn").
4. Chọn **cùng phương pháp mã hóa và cùng key** trên hai máy, rồi bấm **Lưu cài đặt**.
5. Nhắn tin bằng ô nhập ở dưới; bấm 📷 để gửi ảnh.

> Một số mạng WiFi công cộng hoặc WiFi trường học chặn các thiết bị kết nối trực tiếp với nhau (client isolation).
> Khi đó app sẽ báo lỗi kết nối. Hãy dùng router riêng hoặc điểm phát WiFi (hotspot) của một điện thoại khác.

## Mã hóa

| Phương pháp | Cách cài đặt | Ghi chú |
|---|---|---|
| **AES** | AES-256-CBC, key dẫn xuất bằng SHA-256, IV ngẫu nhiên cho mỗi tin | Khuyến nghị dùng |
| **DES** | DES-ECB, key 8 byte | Đã lỗi thời, chỉ để minh họa |
| **Caesar** | Dịch chữ cái theo số bước (1–25) | Không an toàn, chỉ để minh họa |
| **RSA** | AES-256-CBC với key dẫn xuất riêng | Không phải RSA thật: hai bên dùng chung một key |

- IV được sinh bằng bộ sinh số ngẫu nhiên an toàn của hệ điều hành (`react-native-get-random-values`).
- Nếu mã hóa thất bại, tin nhắn **không được gửi** (app không bao giờ gửi bản rõ khi đang bật mã hóa).
- Nếu bên nhận dùng sai key hoặc sai phương pháp, tin nhắn hiện thông báo "Không giải mã được" thay vì nội dung.

## Giao thức truyền

Mỗi tin nhắn được gửi trên một kết nối TCP riêng tới cổng `8888` của máy nhận:

```
[10 chữ số: độ dài payload tính theo byte UTF-8]['|'][payload]
```

Payload (sau khi giải mã) là JSON:

- Văn bản: `{"type": "TEXT", "text": "...", "metadata": {"username": "...", "autoDeleteIn": 0}}`
- Ảnh: `{"type": "FILE", "data": {"fileName", "fileSize", "mimeType", "fileContent" (base64), "checksum"}}`

Độ dài tính theo byte và dữ liệu được ghép lại trước khi giải mã UTF-8, nên ký tự nhiều byte (tiếng Việt, emoji)
không bị hỏng khi một tin bị chia thành nhiều gói TCP (`src/utils/framing.ts`).

## Build từ mã nguồn

Yêu cầu: Node.js 20 trở lên, JDK 17, Android SDK (API 36) và một điện thoại Android bật USB debugging
(hoặc máy ảo Android).

```bash
npm ci                  # cài thư viện
npm run android         # build và cài bản debug lên điện thoại đang cắm
```

Build file APK release (đã đóng gói JavaScript, chạy không cần máy tính):

```bash
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

## Kiểm thử

```bash
npx tsc --noEmit        # kiểm tra kiểu TypeScript
npm run lint            # ESLint
npm test                # Jest: mã hóa, framing TCP, giao thức file, render App
npm run test:scripts    # các script kiểm thử độc lập trong test/
```

Thư mục `e2e/` chứa kiểm thử giao diện chạy trên máy ảo Android bằng [Maestro](https://maestro.mobile.dev),
được chạy tự động trên GitHub Actions (`.github/workflows/android.yml`):

- **Một máy** (Android 14 và 16): gửi/nhận với cả 4 phương pháp mã hóa, tự hủy tin, nhận văn bản tiếng Việt và ảnh
  từ một máy khác.
- **Hai máy**: hai máy ảo nhắn tin hai chiều, gửi ảnh từ thư viện, đổi lần lượt 4 phương pháp mã hóa, thử sai key;
  toàn bộ dữ liệu truyền giữa hai máy được ghi lại và kiểm tra để chắc chắn không có bản rõ.

## Cấu trúc thư mục

```
App.tsx                   Giao diện, kết nối TCP, gửi/nhận tin nhắn
src/utils/
  aesEncryption.ts        AES-256-CBC
  desEncryption.ts        DES
  caesarCipher.ts         Caesar
  rsaEncryption.ts        "RSA" (AES với key chung)
  digitalSignature.ts     Chữ ký HMAC-SHA256 (thư viện, chưa dùng trên giao diện)
  fileHandler.ts          Kiểm tra file, đóng gói/giải mã tin nhắn ảnh, checksum
  framing.ts              Đóng/mở khung tin nhắn TCP
__tests__/, test/         Kiểm thử đơn vị
e2e/                      Kiểm thử giao diện trên máy ảo
android/, ios/            Mã nguồn native
```

## Giới hạn

- Chưa hỗ trợ trao đổi khóa: hai bên phải tự thống nhất key trước.
- DES và Caesar không an toàn; "RSA" thực chất là mã hóa đối xứng.
- Chỉ gửi được ảnh; tên ảnh do thư viện chọn ảnh đặt tạm.
- Không lưu lịch sử: tin nhắn mất khi đóng app.
- Mới kiểm thử trên Android; mã iOS có sẵn nhưng chưa được build thử.
