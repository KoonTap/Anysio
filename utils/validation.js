/* ตัวช่วยตรวจข้อมูลทั่วไป ไม่ใช่ Middleware */
/* สร้าง Error พร้อม HTTP status ให้ Error Middleware ตอบกลับ */
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* รับเฉพาะรหัสจำนวนเต็มบวกที่ JavaScript แทนค่าได้อย่างปลอดภัย */
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw fail(400, 'รหัสรายการไม่ถูกต้อง');
  return n;
}

/* ตรวจชนิด ความยาว และค่าว่าง แล้วตัดช่องว่างหัวท้าย */
function text(value, label, max = 1000, required = true) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max)
    throw fail(400, `${label}ไม่ถูกต้อง (ไม่เกิน ${max} ตัวอักษร)`);
  return value.trim();
}

/* ตรวจวันที่ YYYY-MM-DD ให้มีอยู่จริง; ไม่กรอกให้คืน null */
function date(value) {
  if (!value) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw fail(400, 'วันที่ไม่ถูกต้อง');
  return value;
}

/* รับนัดในอนาคตตามเวลาไทย ช่วง 09:00–16:30 ทุกครึ่งชั่วโมง */
function slot(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:(00|30)$/.test(value))
    throw fail(400, 'เลือกเวลาเป็นช่วงละ 30 นาที');
  date(value.slice(0, 10));
  const hour = Number(value.slice(11, 13));
  if (hour < 9 || hour >= 17) throw fail(400, 'คลินิกรับนัดเวลา 09:00–16:30 น.');
  const d = new Date(value + ':00+07:00');
  if (!Number.isFinite(d.getTime()) || d <= new Date())
    throw fail(400, 'กรุณาเลือกวันและเวลาในอนาคต');
  return d.toISOString();
}

module.exports = { fail, id, text, date, slot };
