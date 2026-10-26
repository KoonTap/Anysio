/* Model file: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* ลบข้อมูลตามรหัส โดยคงข้อจำกัด Foreign Key ของฐานข้อมูล (ข้อมูลภาพแนบ) */
function remove(db, fileId) {
  return db.query('DELETE FROM files WHERE id=$1', [fileId]);
}

/* อ่านและล็อกแถวจนจบ Transaction เพื่อป้องกันการแก้พร้อมกัน (ข้อมูลภาพแนบ) */
function findForUpdate(db, fileId) {
  return db.query('SELECT * FROM files WHERE id=$1 FOR UPDATE', [fileId]);
}

/* ค้นข้อมูลตามรหัส (ข้อมูลภาพแนบ) */
function findById(db, fileId) {
  return db.query('SELECT * FROM files WHERE id=$1', [fileId]);
}

/* เพิ่มข้อมูลใหม่ (ข้อมูลภาพแนบ) */
function create(db, appointmentId, uploadedBy, originalName, storedName, mimeType, sizeBytes) {
  return db.query(
    'INSERT INTO files(appointment_id,uploaded_by,original_name,stored_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [appointmentId, uploadedBy, originalName, storedName, mimeType, sizeBytes]
  );
}

/* อ่านภาพแนบของนัดเรียงจากล่าสุด (ข้อมูลภาพแนบ) */
function listByAppointment(db, appointmentId) {
  return db.query('SELECT * FROM files WHERE appointment_id=$1 ORDER BY id DESC', [appointmentId]);
}

module.exports = { remove, findForUpdate, findById, create, listByAppointment };
