/* Model session: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* ล้าง Session ของบัญชีที่ถูกลบ (Session) */
function removeForUser(db, userId) {
  return db.query("DELETE FROM session WHERE sess->>'userId'=$1", [userId]);
}

module.exports = { removeForUser };
