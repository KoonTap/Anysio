/* Error Middleware บันทึก Login ล้มเหลวและการถูกปฏิเสธสิทธิ์เพียงครั้งเดียว */
const audit = require('../services/auditLog');
function auditErrors(db) {
  return async (err, req, res, next) => {
    const status = err.status || 500;
    const loginAttempt = req.method === 'POST' && /^\/login\/?$/i.test(req.path);

    try {
      if (loginAttempt) {
        req.attemptedUsername =
          typeof req.body?.username === 'string'
            ? req.body.username.trim().slice(0, 80) || null
            : null;
        await audit(
          db,
          req,
          'login',
          'auth',
          null,
          [403, 429].includes(status) ? 'denied' : 'failure'
        );
      } else if ([401, 403].includes(status)) {
        await audit(
          db,
          req,
          req.path.includes('/files') ? 'file.access.denied' : 'access.denied',
          'route',
          req.path,
          'denied'
        );
      }
    } catch {
      // ส่งข้อผิดพลาดเดิมต่อ แม้ฐานข้อมูล Log ขัดข้อง โดยไม่เปิดเผยข้อมูลลับ
      console.error('Failed to persist error audit');
    }

    next(err);
  };
}
module.exports = auditErrors;
