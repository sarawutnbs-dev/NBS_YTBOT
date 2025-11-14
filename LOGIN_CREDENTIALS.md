# Login Credentials

## Test User Account

**Username:** `TestShopee`
**Password:** `shopeeTest@!NBS2018`
**Email:** `testshopee@notebookspec.com`
**Role:** `USER`

### Access Permissions
- ✅ Can access all dashboard menus (Moderation, Transcripts, etc.)
- ❌ **Cannot access** `/dashboard/users` (User Management)
- ✅ Can create and manage comment drafts
- ✅ Can post replies to YouTube

### Login Methods
1. **Username/Password Login**: Use the credentials above
2. **Google OAuth Login**: Available for whitelisted Google accounts

## Admin Access
Only users with `role: ADMIN` can:
- Access User Management page (`/dashboard/users`)
- Create/manage user accounts
- Change user roles and permissions

## Creating New Users

### Method 1: Via Seed Script (Username/Password)
```bash
# Edit scripts/seed-test-user.ts with new credentials
npx tsx scripts/seed-test-user.ts
```

### Method 2: Via User Management UI (Admin Only)
- Login as ADMIN
- Navigate to `/dashboard/users`
- Add email for Google OAuth users

### Method 3: Direct Database (Development)
```typescript
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const hashedPassword = await bcrypt.hash("password", 10);

await prisma.user.create({
  data: {
    username: "username",
    password: hashedPassword,
    email: "user@example.com",
    role: "USER",
    allowed: true
  }
});
```

## Security Notes
- Passwords are hashed using bcryptjs with salt rounds = 10
- Session management via NextAuth JWT strategy
- Protected routes enforced by middleware
- Role-based access control on both client and server side
