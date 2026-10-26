/* โหลดผู้ใช้และ ACL ใหม่ทุกคำขอ แล้วเตรียมตัวแปรให้ Views */
const { has, any } = require('../utils/permissions');
const userModel = require('../models/userModel');
const aclModel = require('../models/aclModel');
const csrf = require('./csrf');
module.exports = function context(db) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.session.userId) {
      const u = (await userModel.findSessionUser(db, req.session.userId)).rows[0];
      if (u?.is_active) {
        u.permissions = (await aclModel.listRolePermissions(db, u.role_id)).rows.map((x) => x.code);
        req.user = u;
      }
    }

    /* ส่งตัวแปรและฟังก์ชันให้ EJS ใช้แสดงเมนู ชื่อผู้ใช้ วันที่ และสถานะ */
    res.locals.user = req.user || null;
    res.locals.has = (code) => has(req.user, code);
    res.locals.any = (codes) => any(req.user, codes);
    res.locals.adminMenu = [
      'user.manage',
      'role.manage',
      'permission.manage',
      'acl.manage',
      'log.read'
    ];
    res.locals.currentPath = req.path;
    res.locals.formatDate = (d) =>
      d
        ? new Date(d).toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
            dateStyle: 'medium',
            timeStyle: 'short'
          })
        : '—';
    res.locals.dateValue = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    res.locals.statusNames = {
      pending: 'รอยืนยัน',
      confirmed: 'ยืนยันแล้ว',
      rejected: 'ปฏิเสธ',
      cancelled: 'ยกเลิก',
      checked_in: 'เช็กอินแล้ว',
      completed: 'ตรวจเสร็จ'
    };

    /* ฟอร์มภาพต้องให้ Multer อ่านข้อมูลก่อน จึงตรวจ CSRF ภายใน Route อัปโหลด */
    if (req.is('multipart/form-data')) {
      // Multipart CSRF is checked after the bounded, in-memory parser in the upload route.
      if (!req.session.csrf)
        req.session.csrf = require('node:crypto').randomBytes(32).toString('hex');
      res.locals.csrf = req.session.csrf;
      return next();
    }
    csrf(req, res, next);
  };
};
