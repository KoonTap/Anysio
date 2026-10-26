/* Controller acl: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const aclModel = require('../models/aclModel');
const permissionModel = require('../models/permissionModel');
const roleModel = require('../models/roleModel');

module.exports = function createAclController(db) {
  // API ส่ง JSON; ฟอร์มหน้าเว็บ redirect กลับไปหน้ารายการ
  const respond = (req, res, url, data = { ok: true }) =>
    req.originalUrl.startsWith('/api/') ? res.json(data) : res.redirect(url);

  /* อ่าน Role, Permission และตารางเชื่อม เพื่อนำไปสร้างตารางสิทธิ์ */
  const show = async (req, res) => {
    const roles = (await roleModel.list(db)).rows;
    const permissions = (await permissionModel.list(db)).rows;
    const grants = (await aclModel.list(db)).rows;
    if (req.originalUrl.startsWith('/api/'))
      return res.json({
        roles,
        permissions,
        grants
      });
    res.render('admin/acl', {
      title: 'ตารางสิทธิ์ ACL',
      roles,
      permissions,
      grants
    });
  };

  /* ให้หรือถอน Permission ของ Role ตาม enabled; Admin มีสิทธิ์อัตโนมัติจึงไม่ใช้สวิตช์ */
  const update = async (req, res) => {
    const roleId = id(req.body.role_id),
      permissionId = id(req.body.permission_id);
    const enabled = req.body.enabled === '1';
    await transaction(db, async (c) => {
      const role = (await roleModel.findById(c, roleId)).rows[0];
      if (!role) throw fail(404, 'ไม่พบบทบาท');
      if (role.is_admin) throw fail(409, 'Admin มีสิทธิ์ทุกฟังก์ชันโดยอัตโนมัติ');
      // Only Admin may delegate management privileges, preventing indirect Admin takeover.
      const p = (await permissionModel.findCodeById(c, permissionId)).rows[0];
      if (!p) throw fail(404, 'ไม่พบสิทธิ์');
      if (
        !req.user.is_admin &&
        ['user.manage', 'role.manage', 'permission.manage', 'acl.manage'].includes(p.code)
      )
        throw fail(403, 'เฉพาะ Admin ที่มอบสิทธิ์จัดการระบบได้');
      if (enabled) await aclModel.grant(c, roleId, permissionId);
      else await aclModel.revoke(c, roleId, permissionId);
      await audit(c, req, 'acl.update', 'role', roleId, 'success', {
        permission: p.code,
        enabled
      });
    });
    respond(req, res, '/admin/acl');
  };

  return { show, update };
};
