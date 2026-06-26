# ITDLUPanel Build & Restart Tool

Tool hỗ trợ build và restart panel một cách nhanh chóng.

## Cách sử dụng

### Shell Script

```bash
./panel-build.sh [command]
```

### Makefile

```bash
make [target]
```

## Commands

| Command  | Mô tả                                    |
|----------|------------------------------------------|
| `restart`| Build và restart panel (mặc định)         |
| `start`  | Build và start panel                     |
| `stop`   | Stop panel                               |
| `build`  | Chỉ build, không restart                 |
| `status` | Hiển thị trạng thái panel               |
| `logs`   | Xem logs (mặc định 50 dòng cuối)       |
| `health` | Kiểm tra health check                   |

## Ví dụ

```bash
# Build và restart
./panel-build.sh restart

# Chỉ build
./panel-build.sh build

# Xem logs
./panel-build.sh logs 100

# Kiểm tra trạng thái
./panel-build.sh status

# Hoặc dùng make
make restart
make status
make logs
```

## Tính năng

- Tự động tìm Go version phù hợp (ưu tiên Go 1.21+)
- Graceful stop trước khi restart
- Health check sau khi start
- Màu sắc cho output dễ đọc
- Logs được ghi ra `/var/log/itdlupanel.log`
