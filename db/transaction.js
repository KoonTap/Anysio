/* ครอบงานหลาย Model ด้วย Transaction เดียว; ย้อนกลับทั้งหมดเมื่อมีข้อผิดพลาด */
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
module.exports = transaction;
