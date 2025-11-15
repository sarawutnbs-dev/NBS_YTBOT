# Server Database Connection Guide

คู่มือการเชื่อมต่อ Prisma จากเครื่อง local ไปยัง production database บน server

## การตั้งค่า SSH Tunnel

SSH tunnel ทำหน้าที่ forward port จาก local ไปยัง database บน server อย่างปลอดภัย

### Port Mapping
```
localhost:5435 (local) → SSH Tunnel → server:5434 → Docker Container:5432
```

## คำสั่งที่ใช้งาน

### 1. เริ่ม SSH Tunnel
```bash
npm run tunnel:start
```
คำสั่งนี้จะสร้าง SSH tunnel ที่ forward port 5435 (local) ไปยัง database บน server

### 2. ตรวจสอบสถานะ Tunnel
```bash
npm run tunnel:status
```
จะแสดงสถานะการเชื่อมต่อที่ port 5435

### 3. ปิด SSH Tunnel
```bash
npm run tunnel:stop
```
ปิดการเชื่อมต่อ SSH tunnel

## การใช้งาน Prisma กับ Server Database

### Prisma Studio
เปิด Prisma Studio เพื่อดูข้อมูลบน production database:
```bash
npm run server:studio
```
Prisma Studio จะเปิดที่ http://localhost:5556

### Prisma Migrate
Deploy migrations ไปยัง production database:
```bash
npm run server:migrate
```

### Prisma CLI Commands
สำหรับคำสั่ง Prisma อื่นๆ ให้ใช้ `dotenv` เพื่อโหลด `.env.server`:
```bash
# ตัวอย่าง
npx dotenv -e .env.server -- prisma db seed
npx dotenv -e .env.server -- prisma db pull
```

หรือใช้ `--url` parameter โดยตรง:
```bash
npx prisma db execute --url "postgresql://nbsytbot:nbsytbot123@localhost:5435/nbsytbot?schema=public" --stdin <<< "SELECT COUNT(*) FROM \"Product\""
```

## Configuration Files

### `.env.server`
ไฟล์นี้เก็บ connection string สำหรับเชื่อมต่อกับ server database ผ่าน SSH tunnel:
```env
DATABASE_URL="postgresql://nbsytbot:nbsytbot123@localhost:5435/nbsytbot?schema=public"
```

**หมายเหตุ:**
- Port `5435` คือ local port ที่ forward ไปยัง server
- Password `nbsytbot123` เป็น production database password (ต่างจาก local)
- ไฟล์นี้อยู่ใน `.gitignore` เพื่อความปลอดภัย

## Workflow ที่แนะนำ

### การทำงานกับ Production Database

1. **เริ่มต้น:**
   ```bash
   npm run tunnel:start
   npm run tunnel:status  # ตรวจสอบว่า tunnel ทำงาน
   ```

2. **ทำงานกับ Prisma:**
   ```bash
   npm run server:studio  # เปิด Prisma Studio
   # หรือ
   npm run server:migrate # Deploy migrations
   ```

3. **เสร็จแล้ว:**
   ```bash
   npm run tunnel:stop
   ```

## Troubleshooting

### Port 5435 already in use
```bash
# หยุด tunnel ที่กำลังทำงาน
npm run tunnel:stop

# หรือดู process ที่ใช้ port 5435
powershell -Command "Get-NetTCPConnection -LocalPort 5435"
```

### Cannot connect to database
1. ตรวจสอบว่า SSH tunnel ทำงานอยู่:
   ```bash
   npm run tunnel:status
   ```

2. ตรวจสอบว่า database container บน server ทำงาน:
   ```bash
   ssh root@45.91.134.109 "docker ps | grep nbsbot-db"
   ```

3. ทดสอบการเชื่อมต่อ database:
   ```bash
   npx prisma db execute --url "postgresql://nbsytbot:nbsytbot123@localhost:5435/nbsytbot?schema=public" --stdin <<< "SELECT 1"
   ```

## ข้อควรระวัง

⚠️ **สำคัญ:**
- อย่าลืมปิด tunnel เมื่อใช้งานเสร็จ (`npm run tunnel:stop`)
- ตรวจสอบให้แน่ใจว่ากำลังเชื่อมต่อกับ database ที่ถูกต้อง (production vs local)
- สำรอง database ก่อนทำ migration บน production
- ใช้ `.env.server` เฉพาะเมื่อต้องการเชื่อมต่อกับ production database

## SSH Key Authentication

SSH tunnel ใช้ SSH key authentication (ไม่ต้องใส่ password):
- Private key: `~/.ssh/id_ed25519`
- Public key ถูก deploy ไปยัง server แล้ว

หากต้องการใช้เครื่องอื่น ต้อง setup SSH key ใหม่ตามคู่มือ SSH setup
