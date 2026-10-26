/* ตรวจสิทธิ์ระดับรายการนัดและผลตรวจ โดยอ่านข้อมูลผ่าน Model */
const { has } = require('../utils/permissions');
const { fail } = require('../utils/validation');
const appointmentModel = require('../models/appointmentModel');
/* ค้นนัดพร้อมข้อมูลสัตว์และเจ้าของ แล้วตรวจว่าผู้ใช้เข้าถึงนัดนี้ได้จริง */
async function appointment(db, user, appointmentId) {
  const row = (await appointmentModel.findDetails(db, appointmentId)).rows[0];
  if (!row) throw fail(404, 'ไม่พบนัดหมาย');
  if (
    !(
      user.is_admin ||
      has(user, 'appointment.read.all') ||
      (has(user, 'appointment.read.own') && row.owner_id === user.id) ||
      (has(user, 'appointment.read.assigned') && row.vet_id === user.id)
    )
  )
    throw fail(403, 'คุณไม่มีสิทธิ์เข้าถึงนัดหมายนี้');
  return row;
}

/* ตรวจสิทธิ์อ่านผลตรวจแยกจากสิทธิ์ดูนัด: เจ้าหน้าที่ที่ดูนัดได้อาจดูผลตรวจไม่ได้ */
function canVisit(user, a) {
  return (
    user.is_admin ||
    (has(user, 'visit.read.own') && a.owner_id === user.id) ||
    (has(user, 'visit.read.assigned') && a.vet_id === user.id)
  );
}
module.exports = {
  appointment,
  canVisit
};
