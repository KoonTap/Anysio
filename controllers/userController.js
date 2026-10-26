/* Controller user: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id, text } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const roleModel = require('../models/roleModel');
const sessionModel = require('../models/sessionModel');

module.exports = function createUserController(db) {
  // API ส่ง JSON; ฟอร์มหน้าเว็บ redirect กลับไปหน้ารายการ
  const respond = (req, res, url, data = { ok: true }) =>
    req.originalUrl.startsWith('/api/') ? res.json(data) : res.redirect(url);

  /* แสดงบัญชีและบทบาท; ไม่ส่ง password_hash ไปให้หน้าเว็บหรือ API */
  const list = async (req, res) => {
    const users = (await userModel.list(db)).rows;
    const roles = (await roleModel.list(db)).rows;
    if (req.originalUrl.startsWith('/api/'))
      return res.json({
        users,
        roles
      });
    res.render('admin/users', {
      title: 'จัดการผู้ใช้',
      users,
      roles
    });
  };

  /* แก้ชื่อและ Role โดยป้องกันการลดสิทธิ์ Admin คนสุดท้าย */
  const update = async (req, res) => {
    await transaction(db, async (c) => {
      // Serialize mutations that can remove the last active administrator.
      await roleModel.lockAdmin(c);
      const u = (await userModel.findForUpdate(c, id(req.params.id))).rows[0];
      if (!u) throw fail(404, 'ไม่พบผู้ใช้');
      const role = (await roleModel.findById(c, id(req.body.role_id))).rows[0];
      if (!role) throw fail(400, 'ไม่พบบทบาท');
      if ((role.is_admin || u.is_admin) && !req.user.is_admin)
        throw fail(403, 'เฉพาะ Admin เท่านั้นที่แก้ไขบัญชี Admin ได้');

      /* คงสถานะบัญชีเดิม; ฟอร์มปัจจุบันไม่ได้เปิดให้เปลี่ยน is_active */
      const active = u.is_active;
      if (u.is_admin && u.is_active && (!role.is_admin || !active)) {
        const n = Number((await userModel.countActiveAdmins(c)).rows[0].n);
        if (n <= 1) throw fail(409, 'ต้องมี Admin ที่เปิดใช้งานอย่างน้อยหนึ่งคน');
      }
      await userModel.update(c, text(req.body.full_name, 'ชื่อ', 150), role.id, active, u.id);
      await audit(c, req, 'user.update', 'user', u.id, 'success', {
        previous_role: u.role_id,
        role: role.id,
        active
      });
    });
    respond(req, res, '/admin/users');
  };

  /* ลบบัญชีถาวรหลังยืนยันชื่อ; ห้ามลบตนเอง Admin คนสุดท้าย หรือบัญชีที่มีข้อมูลคลินิก */
  const remove = async (req, res) => {
    await transaction(db, async (c) => {
      await roleModel.lockAdmin(c);
      const u = (await userModel.findForUpdate(c, id(req.params.id))).rows[0];
      if (!u) throw fail(404, 'ไม่พบผู้ใช้');
      if (u.is_admin && !req.user.is_admin)
        throw fail(403, 'เฉพาะ Admin เท่านั้นที่ลบบัญชี Admin ได้');
      if (u.is_admin && u.is_active) {
        const count = Number((await userModel.countActiveAdmins(c)).rows[0].n);
        if (count <= 1) throw fail(409, 'ไม่สามารถลบ Admin ที่เปิดใช้งานคนสุดท้าย');
      }
      if (u.id === req.user.id)
        throw fail(409, 'ไม่สามารถลบบัญชีที่กำลังใช้งาน กรุณาใช้บัญชี Admin อื่น');
      if (req.body.confirm_username !== u.username)
        throw fail(400, 'กรุณาพิมพ์ชื่อผู้ใช้ให้ตรงเพื่อยืนยันการลบบัญชี');

      /* ตรวจข้อมูลที่อ้างถึงบัญชีก่อนลบ เพื่อไม่ให้สัตว์ นัด ผลตรวจ หรือไฟล์สูญเสียผู้เกี่ยวข้อง */
      const linked = (await userModel.hasClinicalData(c, u.id)).rows[0].found;
      if (linked)
        throw fail(
          409,
          'ลบบัญชีไม่ได้ เพราะมีสัตว์เลี้ยง นัดหมาย ผลตรวจ หรือไฟล์ที่เกี่ยวข้อง กรุณาจัดการข้อมูลเหล่านั้นก่อน'
        );
      // Keep the audit trail readable without retaining a foreign key to a deleted account.

      /* คงประวัติ Log แต่ตัดการอ้างอิงบัญชีที่ลบ และเก็บชื่อ/รหัสเดิมไว้ */
      await auditModel.detachUser(c, u.id, u.username);
      await sessionModel.removeForUser(c, String(u.id));
      await userModel.remove(c, u.id);
      await audit(c, req, 'user.delete', 'user', u.id, 'success', {
        username: u.username
      });
    });
    respond(req, res, '/admin/users');
  };

  return { list, update, remove };
};
