BEGIN;

-- บทบาทผู้ใช้; is_admin ระบุสิทธิ์สูงสุด ส่วน code เป็นรหัสอ้างอิงที่คงที่
CREATE TABLE roles (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '', is_admin BOOLEAN NOT NULL DEFAULT FALSE
);

-- ให้มี Role ที่เป็น Admin ได้เพียงหนึ่ง Role แต่มีหลายบัญชีใช้ Role นี้ได้
CREATE UNIQUE INDEX single_admin_role ON roles (is_admin) WHERE is_admin;

-- รายการสิทธิ์; code ต้องตรงกับรหัสที่ Route ตรวจ
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
);

-- ตารางเชื่อมหลายต่อหลายระหว่าง Role กับ Permission; ลบต้นทางแล้วลบคู่สิทธิ์ตาม
CREATE TABLE role_permissions (
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

-- บัญชีผู้ใช้: เก็บรหัสผ่านแบบ Hash และอ้างถึง Role หนึ่งรายการ
CREATE TABLE users (
  id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL, role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- สัตว์เลี้ยงแต่ละตัวมีเจ้าของ; ประเภทจำกัดเป็น dog, cat หรือ other
CREATE TABLE pets (
  id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL,
  species TEXT NOT NULL CHECK(species IN ('dog','cat','other')), breed TEXT NOT NULL DEFAULT '',
  birth_date DATE, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- นัดหมายอ้างถึงสัตว์และแพทย์; นัดยืนยัน/เช็กอิน/ตรวจเสร็จต้องมีแพทย์
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY, pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE RESTRICT,
  vet_id INTEGER REFERENCES users(id), scheduled_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','confirmed','rejected','cancelled','checked_in','completed')),
  reject_reason TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(status NOT IN ('confirmed','checked_in','completed') OR vet_id IS NOT NULL)
);

-- ห้ามแพทย์มีคิวเวลาเดียวกันในสถานะที่ยังครองคิว; ยกเลิก/ปฏิเสธไม่ขวางคิว
CREATE UNIQUE INDEX vet_slot_unique ON appointments(vet_id, scheduled_at)
  WHERE status IN ('confirmed','checked_in','completed');

-- ห้ามสัตว์มีนัดซ้ำเวลาเดียวกัน รวมคำขอที่ยัง pending
CREATE UNIQUE INDEX pet_slot_unique ON appointments(pet_id, scheduled_at)
  WHERE status IN ('pending','confirmed','checked_in','completed');

-- ผลตรวจหนึ่งรายการต่อนัด เก็บวินิจฉัย การรักษา และวันติดตามผล (ไม่สร้างนัดใหม่อัตโนมัติ)
CREATE TABLE visit_records (
  id SERIAL PRIMARY KEY, appointment_id INTEGER UNIQUE NOT NULL REFERENCES appointments(id),
  vet_id INTEGER NOT NULL REFERENCES users(id), diagnosis TEXT NOT NULL, treatment TEXT NOT NULL,
  follow_up_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- เก็บข้อมูลกำกับภาพและความสัมพันธ์กับนัด; ไฟล์จริงเก็บใน uploads
CREATE TABLE files (
  id SERIAL PRIMARY KEY, appointment_id INTEGER NOT NULL REFERENCES appointments(id),
  uploaded_by INTEGER NOT NULL REFERENCES users(id), original_name TEXT NOT NULL,
  stored_name TEXT UNIQUE NOT NULL, mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- บันทึกเหตุการณ์ถาวรพร้อมผู้กระทำ ผลลัพธ์ และรายละเอียด JSONB
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INTEGER REFERENCES users(id), username_attempted TEXT, event_type TEXT NOT NULL,
  resource TEXT NOT NULL, resource_id TEXT, result TEXT NOT NULL CHECK(result IN ('success','denied','failure')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ดัชนีช่วยค้นประวัติตามเวลา ผู้ใช้ และชนิดเหตุการณ์
CREATE INDEX audit_logs_filter ON audit_logs(created_at DESC, user_id, event_type);

-- ที่เก็บ Session สำหรับ connect-pg-simple: sid คือรหัส Cookie, sess คือข้อมูล, expire คือวันหมดอายุ
CREATE TABLE session (sid VARCHAR NOT NULL PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP(6) NOT NULL);

-- ดัชนีสำหรับค้นและจัดการ Session ที่หมดอายุ
CREATE INDEX session_expire ON session(expire);
COMMIT;
