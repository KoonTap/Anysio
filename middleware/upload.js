/* ตรวจสิทธิ์นัดก่อนอ่าน multipart; จำกัดขนาดภาพก่อนส่งให้ Controller */
const multer = require('multer');
const { appointment } = require('../services/clinicAccess');
const { id, fail } = require('../utils/validation');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, parts: 3 }
});
function authorizeUpload(db) {
  return async (req, res, next) => {
    req.appointment = await appointment(db, req.user, id(req.params.id));
    if (req.appointment.status === 'completed' && !req.user.is_admin)
      throw fail(409, 'นัดที่ตรวจเสร็จแล้วไม่รับภาพเพิ่มเติม');
    next();
  };
}
module.exports = { authorizeUpload, upload };
