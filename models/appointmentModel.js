/* Model appointment: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */
const { appointmentScope } = require('./scopes');

/* เปลี่ยนนัดเป็นตรวจเสร็จหลังบันทึกผล (นัดหมาย) */
function complete(db, appointmentId) {
  return db.query("UPDATE appointments SET status='completed',updated_at=now() WHERE id=$1", [
    appointmentId
  ]);
}

/* ล็อกนัดก่อนเปลี่ยนสถานะหรือผลตรวจ (นัดหมาย) */
function lock(db, appointmentId) {
  return db.query('SELECT id FROM appointments WHERE id=$1 FOR UPDATE', [appointmentId]);
}

/* เปลี่ยนสถานะ ผู้ตรวจ และเหตุผลปฏิเสธนัด (นัดหมาย) */
function updateStatus(db, status, vetId, rejectReason, appointmentId) {
  return db.query(
    'UPDATE appointments SET status=$1,vet_id=$2,reject_reason=$3,updated_at=now() WHERE id=$4',
    [status, vetId, rejectReason, appointmentId]
  );
}

/* เพิ่มข้อมูลใหม่ (นัดหมาย) */
function create(db, petId, scheduledAt, reason) {
  return db.query(
    'INSERT INTO appointments(pet_id,scheduled_at,reason) VALUES($1,$2,$3) RETURNING id',
    [petId, scheduledAt, reason]
  );
}

/* อ่านเฉพาะข้อมูลที่ผู้ใช้มีสิทธิ์เข้าถึง (นัดหมาย) */
function listVisible(db, user) {
  const scope = appointmentScope(user);
  return db.query(
    `SELECT a.*,p.name AS pet_name,v.full_name AS vet_name FROM appointments a JOIN pets p ON p.id=a.pet_id LEFT JOIN users v ON v.id=a.vet_id WHERE ${scope.sql} ORDER BY a.scheduled_at DESC`,
    scope.args
  );
}

/* อ่านนัดพร้อมสัตว์ เจ้าของ และชื่อแพทย์ (นัดหมาย) */
function findDetails(db, appointmentId) {
  return db.query(
    'SELECT a.*,p.name AS pet_name,p.owner_id,u.full_name AS owner_name,v.full_name AS vet_name FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN users u ON u.id=p.owner_id LEFT JOIN users v ON v.id=a.vet_id WHERE a.id=$1',
    [appointmentId]
  );
}

module.exports = { complete, lock, updateStatus, create, listVisible, findDetails };
