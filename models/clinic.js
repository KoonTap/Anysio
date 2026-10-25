/* Model รวมกฎขอบเขตการอ่านนัดหมายและผลตรวจ เพื่อใช้ซ้ำในหลาย Route */
const {
  has,
  fail
} = require('../middleware/security');

/* สร้างเงื่อนไข SQL สำหรับนัดทั้งหมด / ของตน / ที่ได้รับมอบหมาย พร้อมค่าพารามิเตอร์ */
function appointmentScope(user, alias = 'a', petAlias = 'p') {
  if (user.is_admin || has(user, 'appointment.read.all')) return {
    sql: 'TRUE',
    args: []
  };
  const conditions = [];
  if (has(user, 'appointment.read.own')) conditions.push(`${petAlias}.owner_id=$1`);
  if (has(user, 'appointment.read.assigned')) conditions.push(`${alias}.vet_id=$1`);
  return {
    sql: conditions.length ? `(${conditions.join(' OR ')})` : 'FALSE',
    args: conditions.length ? [user.id] : []
  };
}

/* ค้นนัดพร้อมข้อมูลสัตว์และเจ้าของ แล้วตรวจว่าผู้ใช้เข้าถึงนัดนี้ได้จริง */
async function appointment(db, user, appointmentId) {
  const row = (await db.query(
    'SELECT a.*,p.name AS pet_name,p.owner_id,u.full_name AS owner_name,v.full_name AS vet_name FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN users u ON u.id=p.owner_id LEFT JOIN users v ON v.id=a.vet_id WHERE a.id=$1',
    [appointmentId])).rows[0];
  if (!row) throw fail(404, 'ไม่พบนัดหมาย');
  if (!(user.is_admin || has(user, 'appointment.read.all') || (has(user,
      'appointment.read.own') && row.owner_id === user.id) || (has(user,
      'appointment.read.assigned') && row.vet_id === user.id))) throw fail(403,
    'คุณไม่มีสิทธิ์เข้าถึงนัดหมายนี้');
  return row;
}

/* ตรวจสิทธิ์อ่านผลตรวจแยกจากสิทธิ์ดูนัด: เจ้าหน้าที่ที่ดูนัดได้อาจดูผลตรวจไม่ได้ */
function canVisit(user, a) {
  return user.is_admin || (has(user, 'visit.read.own') && a.owner_id === user.id) || (has(user,
    'visit.read.assigned') && a.vet_id === user.id);
}
module.exports = {
  appointmentScope,
  appointment,
  canVisit
};
