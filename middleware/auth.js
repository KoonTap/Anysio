/* Middleware ตรวจการเข้าสู่ระบบและ Permission ก่อนเรียก Controller */
const { fail } = require('../utils/validation');
const { any } = require('../utils/permissions');
function login(req, res, next) {
  if (!req.user) return next(fail(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'));
  next();
}

function permission(...codes) {
  return (req, res, next) => {
    if (!req.user) return next(fail(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'));
    if (!any(req.user, codes)) return next(fail(403, 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้'));
    next();
  };
}
module.exports = { login, permission };
