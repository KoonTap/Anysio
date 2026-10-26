/* Middleware ตรวจ Token ของฟอร์มก่อนเปลี่ยนข้อมูล */
const crypto = require('node:crypto');
const { fail } = require('../utils/validation');
function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.body?._csrf || req.get('x-csrf-token');
  if (
    typeof token !== 'string' ||
    Buffer.byteLength(token) !== Buffer.byteLength(req.session.csrf) ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))
  )
    return next(fail(403, 'แบบฟอร์มหมดอายุ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'));
  next();
}
module.exports = csrf;
