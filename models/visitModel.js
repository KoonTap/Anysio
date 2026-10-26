/* Model visit: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* เพิ่มข้อมูลใหม่ (ผลตรวจ) */
function create(db, diagnosis, treatment, followUpDate, appointmentId, vetId) {
  return db.query(
    'INSERT INTO visit_records(diagnosis,treatment,follow_up_date,appointment_id,vet_id) VALUES($1,$2,$3,$4,$5)',
    [diagnosis, treatment, followUpDate, appointmentId, vetId]
  );
}

/* แก้ไขข้อมูลตามรหัส (ผลตรวจ) */
function update(db, diagnosis, treatment, followUpDate, visitId) {
  return db.query(
    'UPDATE visit_records SET diagnosis=$1,treatment=$2,follow_up_date=$3,updated_at=now() WHERE id=$4',
    [diagnosis, treatment, followUpDate, visitId]
  );
}

/* ตรวจว่ามีผลตรวจเดิมของนัดหรือไม่ (ผลตรวจ) */
function findIdByAppointment(db, appointmentId) {
  return db.query('SELECT id FROM visit_records WHERE appointment_id=$1', [appointmentId]);
}

/* อ่านผลตรวจของนัด (ผลตรวจ) */
function findByAppointment(db, appointmentId) {
  return db.query('SELECT * FROM visit_records WHERE appointment_id=$1', [appointmentId]);
}

module.exports = { create, update, findIdByAppointment, findByAppointment };
