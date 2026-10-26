/* แปลงบริบทคำขอเป็นข้อมูล Log โดยไม่เก็บรหัสผ่าน Cookie หรือ CSRF Token */
const auditModel = require('../models/auditModel');
async function audit(db, req, event, resource, id, result = 'success', detail = {}) {
  await auditModel.create(
    db,
    req.user?.id || null,
    req.attemptedUsername || null,
    event,
    resource,
    id == null ? null : String(id),
    result,
    JSON.stringify(detail)
  );
}
module.exports = audit;
