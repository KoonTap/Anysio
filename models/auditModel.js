/* Model audit: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* อ่านชนิดเหตุการณ์ที่มีใน Log (บันทึกกิจกรรม) */
function listEvents(db) {
  return db.query('SELECT DISTINCT event_type FROM audit_logs ORDER BY event_type');
}

/* ค้น Log ตามตัวกรองที่ Controller ตรวจแล้ว จำกัดล่าสุด 300 รายการ (บันทึกกิจกรรม) */
function search(db, filters) {
  const clauses = [],
    params = [];

  /* ประกอบเงื่อนไขค้นหาพร้อมพารามิเตอร์ $1, $2 เพื่อไม่ต่อค่าผู้ใช้ลง SQL โดยตรง */
  const add = (sql, v) => {
    params.push(v);
    clauses.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.from)
    add("l.created_at >= ?::date::timestamp AT TIME ZONE 'Asia/Bangkok'", filters.from);
  if (filters.to)
    add("l.created_at < (?::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Bangkok'", filters.to);
  if (filters.user_id) add('l.user_id = ?', filters.user_id);
  if (filters.event) add('l.event_type = ?', filters.event);
  return db.query(
    `SELECT l.*,u.username FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY l.id DESC LIMIT 300`,
    params
  );
}

/* เก็บชื่อและรหัสเดิมใน Log ก่อนตัดการอ้างอิงบัญชีที่จะลบ (บันทึกกิจกรรม) */
function detachUser(db, userId, username) {
  return db.query(
    `UPDATE audit_logs SET user_id=NULL,
        username_attempted=COALESCE(username_attempted,$2),
        detail=detail || jsonb_build_object('deleted_user_id',$1::integer)
        WHERE user_id=$1`,
    [userId, username]
  );
}

/* เพิ่มข้อมูลใหม่ (บันทึกกิจกรรม) */
function create(db, userId, username, event, resource, resourceId, result, detail) {
  return db.query(
    'INSERT INTO audit_logs(user_id,username_attempted,event_type,resource,resource_id,result,detail) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [userId, username, event, resource, resourceId, result, detail]
  );
}

module.exports = { listEvents, search, detachUser, create };
