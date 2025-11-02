# YouTube API Setup Guide

## ปัญหาที่พบ
```
Error 403: The comment cannot be created due to insufficient permissions.
```

## สาเหตุ
1. Session ไม่มี OAuth tokens หรือ tokens หมดอายุ
2. Google Cloud Console ยังไม่ได้ตั้งค่า YouTube scope ที่ถูกต้อง

## วิธีแก้ไข

### 1. เช็ค Google Cloud Console

1. ไปที่ https://console.cloud.google.com/apis/credentials
2. เลือก project ที่ใช้งาน
3. ไปที่ **OAuth 2.0 Client IDs**
4. เลือก client ที่ใช้งาน
5. เช็คว่า **Authorized redirect URIs** มี:
   ```
   http://localhost:3000/api/auth/callback/google
   ```

### 2. เปิดใช้งาน YouTube Data API v3

1. ไปที่ https://console.cloud.google.com/apis/library
2. ค้นหา "YouTube Data API v3"
3. คลิก **ENABLE**

### 3. เช็ค OAuth Consent Screen

1. ไปที่ https://console.cloud.google.com/apis/credentials/consent
2. ตรวจสอบว่า **Scopes** มี:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `.../auth/youtube.force-ssl` ⬅️ **สำคัญ!**

3. ถ้าไม่มี ให้เพิ่ม scope:
   - คลิก "ADD OR REMOVE SCOPES"
   - เลือก "YouTube Data API v3"
   - เลือก `.../auth/youtube.force-ssl`
   - คลิก "UPDATE"

### 4. Re-authenticate

หลังจากตั้งค่าเสร็จแล้ว:

1. **Logout**: http://localhost:3000/api/auth/signout
2. **Login ใหม่**: http://localhost:3000
3. Google จะขอ consent ใหม่พร้อม YouTube permissions
4. กดอนุญาต (Allow) ทุกข้อ
5. ลอง Post reply อีกครั้ง

### 5. ตรวจสอบ Session

เช็คว่า session มี tokens:
- accessToken: ✅
- refreshToken: ✅

ถ้าไม่มี แสดงว่าต้อง re-login

## หมายเหตุ

- **YouTube Data API v3** มี quota limit วันละ 10,000 units
- การ post comment ใช้ 50 units ต่อครั้ง
- ถ้า quota หมด ต้องรอวันถัดไป หรือขอเพิ่ม quota

## Troubleshooting

### ถ้ายัง error 403 อยู่:

1. เช็คว่า YouTube channel ที่ login เป็นเจ้าของวิดีโอหรือไม่
2. เช็คว่า comment นั้นสามารถ reply ได้หรือไม่
3. เช็คว่า YouTube channel ไม่ถูก ban หรือ restrict

### ถ้า error 401 Unauthorized:

- แสดงว่า session หมดอายุหรือไม่มี tokens
- ต้อง logout และ login ใหม่

### ถ้า error 400 Bad Request:

- เช็ค reply text ว่าถูกต้องหรือไม่
- เช็ค parentId (commentId) ว่าถูกต้องหรือไม่
