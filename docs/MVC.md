# โครงสร้าง MVC ของ ANYSIO

โปรเจกต์ใช้ Express และ EJS โดยแยกส่วนรับ URL, ควบคุมงาน, เข้าถึงฐานข้อมูล และแสดงผลออกจากกัน

## หน้าที่แต่ละโฟลเดอร์

| ตำแหน่ง | หน้าที่ |
|---|---|
| `server.js` | ประกอบแอป ตั้งค่า Session, static files และลำดับ Middleware แล้วเชื่อม Routes |
| `routes/` | กำหนด HTTP method, URL, Middleware และ Controller ที่ต้องเรียก ไม่มี SQL หรือการ render หน้า |
| `controllers/` | รับข้อมูลจากคำขอ ตรวจข้อมูลและกฎการทำงาน เรียก Models แล้ว render EJS, redirect หรือส่ง JSON |
| `models/` | รวม SQL แบบมีพารามิเตอร์ รับข้อมูลทั่วไปและตัวเชื่อมฐานข้อมูล ไม่รับ `req`/`res` |
| `views/` | EJS สำหรับแสดงหน้าเว็บและฟอร์ม ใช้ข้อมูลที่ Controller ส่งมา |
| `middleware/` | ตรวจ Login, Permission, CSRF, เตรียมผู้ใช้/ตัวแปรหน้าเว็บ, รับไฟล์ และจัดการข้อผิดพลาด |
| `services/` | งานที่ใช้ร่วมกันหลาย Controller เช่น ตรวจการเข้าถึงนัดเฉพาะรายการและบันทึก Audit Log |
| `utils/` | ฟังก์ชันทั่วไปสำหรับตรวจค่าและตรวจสิทธิ์ ไม่ใช่ Middleware |
| `db/` | การเชื่อมต่อฐานข้อมูล, schema, ข้อมูลเริ่มต้น, catalog สิทธิ์ และ Transaction |
| `public/` | CSS, JavaScript ฝั่งเบราว์เซอร์ และภาพที่เปิดดูได้ทั่วไป |
| `uploads/` | ภาพแนบส่วนตัว ต้องอ่านผ่าน Route ที่ตรวจสิทธิ์ ไม่เปิดเป็น static files |

## Routes และ Controllers

| Route | Controller | งาน |
|---|---|---|
| `routes/auth.js` | `authController.js` | หน้าแรก สมัครสมาชิก เข้าสู่ระบบ ออกจากระบบ |
| `routes/clinic.js` | `dashboardController.js` | ภาพรวมและรายการนัดที่เข้าถึงได้ |
| `routes/clinic.js` | `petController.js` | ดู เพิ่ม แก้ไข และลบสัตว์เลี้ยง |
| `routes/clinic.js` | `appointmentController.js` | ขอนัด ดูรายละเอียด ยืนยัน ปฏิเสธ เช็กอิน และยกเลิก |
| `routes/clinic.js` | `visitController.js` | บันทึกและแก้ผลตรวจ |
| `routes/clinic.js` | `fileController.js` | ตรวจภาพ บันทึก เปิด ดาวน์โหลด และลบภาพ |
| `routes/admin.js` | `adminController.js` | เลือกหน้าแรกของส่วนจัดการ |
| `routes/admin.js` | `userController.js` | จัดการบัญชีและบทบาทของผู้ใช้ |
| `routes/admin.js` | `roleController.js` | จัดการบทบาท |
| `routes/admin.js` | `permissionController.js` | จัดการรายการสิทธิ์ |
| `routes/admin.js` | `aclController.js` | ให้หรือถอนสิทธิ์ของบทบาท |
| `routes/admin.js` | `logController.js` | ค้นและแสดงบันทึกกิจกรรม |

ส่วน Admin ใช้ Router เดียวกันที่ `/admin` และ `/api/admin` เพื่อให้หน้าเว็บกับ API ตรวจสิทธิ์และใช้กฎเดียวกัน

## Models

- `userModel.js`: บัญชี ผู้ตรวจที่มีสิทธิ์ และจำนวน Admin ที่เปิดใช้งาน
- `roleModel.js`: บทบาท จำนวนผู้ใช้ในบทบาท และการล็อกบทบาท Admin
- `permissionModel.js`: รายการสิทธิ์
- `aclModel.js`: การผูกสิทธิ์กับบทบาท
- `petModel.js`: สัตว์เลี้ยงและรายการสัตว์ตามขอบเขตผู้ใช้
- `appointmentModel.js`: นัดหมาย สถานะ และข้อมูลประกอบนัด
- `visitModel.js`: ผลตรวจ
- `fileModel.js`: ข้อมูลภาพแนบในฐานข้อมูล ส่วนไฟล์จริงจัดการใน File Controller
- `auditModel.js`: ประวัติกิจกรรมและการค้นประวัติ
- `sessionModel.js`: ล้าง Session ของบัญชีที่ถูกลบ
- `scopes.js`: ประกอบเงื่อนไขขอบเขตนัดตามสิทธิ์

Model คืนผลจาก PostgreSQL (`rows`, `rowCount`) ให้ Controller ใช้ต่อ พารามิเตอร์ตัวแรก `db` รับได้ทั้ง Pool และ Client ที่อยู่ใน Transaction

## Middleware และตัวช่วย

- `middleware/auth.js`: `login` ตรวจการเข้าสู่ระบบ และ `permission(...)` ตรวจสิทธิ์
- `middleware/context.js`: โหลดบัญชีและ ACL ล่าสุด เตรียมตัวแปรให้ EJS และเรียกตรวจ CSRF สำหรับคำขอทั่วไป
- `middleware/csrf.js`: ตรวจ Token ประจำ Session
- `middleware/upload.js`: ตรวจสิทธิ์นัดก่อนรับภาพ และจำกัด multipart ด้วย Multer
- `middleware/audit.js`: Error Middleware บันทึก Login ที่ล้มเหลวและการถูกปฏิเสธสิทธิ์
- `middleware/errors.js`: ตอบ 404 และแปลงข้อผิดพลาดเป็น HTML/JSON
- `services/clinicAccess.js`: ตรวจการเข้าถึงนัดและผลตรวจเฉพาะรายการ
- `services/auditLog.js`: แปลงบริบทผู้กระทำเป็นข้อมูล Log แล้วเรียก Audit Model
- `utils/validation.js`: ตรวจรหัสรายการ ข้อความ วันที่ เวลานัด และสร้าง Error
- `utils/permissions.js`: ฟังก์ชัน `has`/`any`; Admin ผ่านทุก Permission
- `db/transaction.js`: BEGIN/COMMIT/ROLLBACK เพื่อให้การแก้ข้อมูลกับ Audit Log สำเร็จร่วมกัน

## ตัวอย่าง: เพิ่มสัตว์เลี้ยง

1. ฟอร์มใน `views/pets.ejs` ส่ง `POST /app/pets` พร้อม CSRF Token
2. Middleware โหลดผู้ใช้ ตรวจ CSRF, Login และสิทธิ์ `pet.create`
3. `routes/clinic.js` เรียก `petController.create`
4. Controller ตรวจประเภทสัตว์ วันเกิด และข้อมูลที่กรอก
5. Controller เปิด Transaction แล้วเรียก `petModel.create` และตัวช่วยบันทึก Log โดยใช้ Client เดียวกัน
6. ถ้าสำเร็จจะ COMMIT แล้ว redirect กลับ `/app/pets`; หากผิดพลาดจะ ROLLBACK และส่งต่อ Error Middleware
7. เมื่อเปิดรายการ Controller เรียก `petModel.listVisible` แล้วส่งข้อมูลให้ `views/pets.ejs`

## ข้อสำคัญเมื่อแก้โค้ดต่อ

- เพิ่ม URL ใน Routes, ขั้นตอนงานใน Controllers, SQL ใน Models และหน้าจอใน Views
- ใช้ `$1`, `$2` และพารามิเตอร์กับ SQL ห้ามต่อค่าที่ผู้ใช้กรอกลงใน SQL โดยตรง
- การซ่อนปุ่มใน EJS ไม่แทนการตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์
- คงการตรวจเจ้าของสัตว์ ผู้ตรวจที่รับมอบหมาย และสถานะนัดไว้ใน Controller/Service
- งานที่แก้หลายตารางต้องส่ง Client ตัวเดียวกันให้ทุก Model และ Audit Log ภายใน Transaction
- การอัปโหลดต้องเรียงเป็น ตรวจ Login/สิทธิ์ → ตรวจนัด → Multer → CSRF → File Controller
- ไม่ต้องสร้างฐานข้อมูลใหม่หรือรัน seed เมื่อเปลี่ยนมาใช้โครงสร้างนี้

รันแอปตามเดิมด้วย `npm start` หรือ `npm run dev` หากเซิร์ฟเวอร์เดิมยังทำงานอยู่ ให้รีสตาร์ตเพื่อโหลดโมดูลใหม่
