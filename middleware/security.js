/* รวม Middleware ตรวจ Login/Permission/CSRF และฟังก์ชันช่วยตรวจข้อมูลกับบันทึกฐานข้อมูล */
const crypto = require('node:crypto');

/* สร้าง Error ที่มี HTTP status เพื่อให้ตัวจัดการข้อผิดพลาดใน server.js รับต่อ */
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* ตรวจสิทธิ์หนึ่งรายการ; Admin ผ่านการตรวจ Permission โดยอัตโนมัติ */
function has(user, code) {
  return Boolean(user && (user.is_admin || user.permissions.includes(code)));
}

/* ตรวจว่าผู้ใช้มีอย่างน้อยหนึ่งสิทธิ์จากรายการที่รับมา */
function any(user, codes) {
  return codes.some(c => has(user, c));
}

/* บันทึกผู้กระทำ เหตุการณ์ ทรัพยากร ผลลัพธ์ และรายละเอียดลง audit_logs */
async function audit(db, req, event, resource, id, result = 'success', detail = {}) {
  await db.query(
    'INSERT INTO audit_logs(user_id,username_attempted,event_type,resource,resource_id,result,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [req.user?.id || null, req.attemptedUsername || null, event, resource, id == null ? null :
      String(id), result, JSON.stringify(detail)
    ]);
}

/* Error Middleware บันทึก Login ที่ล้มเหลวและการถูกปฏิเสธสิทธิ์ก่อนแสดง Error
   รับ 4 พารามิเตอร์เพื่อให้ Express เรียกเมื่อ Route ส่งข้อผิดพลาดมา
   ไม่คัดลอก body, รหัสผ่าน, Cookie หรือ Token ลงใน Log */
function auditErrors(db) {
  return async (err, req, res, next) => {
    const status = err.status || 500;
    const loginAttempt = req.method === 'POST' && /^\/login\/?$/i.test(req.path);

    try {
      if (loginAttempt) {
        req.attemptedUsername = typeof req.body?.username === 'string' ?
          req.body.username.trim().slice(0, 80) || null : null;
        await audit(db, req, 'login', 'auth', null,
          [403, 429].includes(status) ? 'denied' : 'failure');
      } else if ([401, 403].includes(status)) {
        await audit(db, req, req.path.includes('/files') ?
          'file.access.denied' : 'access.denied', 'route', req.path, 'denied');
      }
    } catch {
      // ส่งข้อผิดพลาดเดิมต่อ แม้ฐานข้อมูล Log ขัดข้อง โดยไม่เปิดเผยข้อมูลลับ
      console.error('Failed to persist error audit');
    }

    next(err);
  };
}

/* สร้าง Token ประจำ Session; คำขอเปลี่ยนข้อมูลต้องส่ง Token ให้ตรงกันจึงเรียก next() */
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.body?._csrf || req.get('x-csrf-token');
  if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(req.session
      .csrf) || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf)))
    return next(fail(403, 'แบบฟอร์มหมดอายุ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'));
  next();
}

/* Middleware บังคับเข้าสู่ระบบ: ไม่มี req.user ให้ตอบ 401 */
function login(req, res, next) {
  if (!req.user) return next(fail(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'));
  next();
}

/* สร้าง Middleware ตรวจ Login และสิทธิ์อย่างน้อยหนึ่งรายการ; ไม่มีสิทธิ์ให้ตอบ 403 */
function permission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(fail(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'));
    if (!any(req.user, codes)) return next(fail(403, 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้'));
    next();
  };
}

/* รับรหัสรายการเป็นจำนวนเต็มบวกที่ JavaScript แทนค่าได้อย่างปลอดภัย */
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw fail(400, 'รหัสรายการไม่ถูกต้อง');
  return n;
}

/* ตรวจชนิดข้อความ ความจำเป็น และความยาว แล้วตัดช่องว่างหัวท้าย */
function text(value, label, max = 1000, required = true) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) throw fail(
    400, `${label}ไม่ถูกต้อง (ไม่เกิน ${max} ตัวอักษร)`);
  return value.trim();
}

/* ตรวจวันที่ YYYY-MM-DD ให้เป็นวันที่จริง; ค่าว่างหมายถึงไม่ระบุวันที่ */
function date(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value)
    .toISOString().slice(0, 10) !== value) throw fail(400, 'วันที่ไม่ถูกต้อง');
  return value;
}

/* ตรวจเวลานัดในอนาคตตามเวลาไทย ช่วง 09:00–16:30 และลงท้ายด้วยนาที 00 หรือ 30 */
function slot(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/.test(value)) throw fail(400,
    'เลือกเวลาเป็นช่วงละ 30 นาที');
  date(value.slice(0, 10));
  const hour = Number(value.slice(11, 13));
  if (hour < 9 || hour >= 17) throw fail(400, 'คลินิกรับนัดเวลา 09:00–16:30 น.');
  const d = new Date(value + ':00+07:00');
  if (!Number.isFinite(d.getTime()) || d <= new Date()) throw fail(400,
    'กรุณาเลือกวันและเวลาในอนาคต');
  return d.toISOString();
}

/* ทำหลายคำสั่ง SQL ให้สำเร็จร่วมกัน: COMMIT เมื่อผ่าน หรือ ROLLBACK เมื่อผิดพลาด */
async function transaction(db, fn) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/* ส่งออกฟังก์ชันให้ Route, Controller และ Model ใช้ร่วมกัน */
module.exports = {
  fail,
  has,
  any,
  audit,
  auditErrors,
  csrf,
  login,
  permission,
  id,
  text,
  date,
  slot,
  transaction
};
