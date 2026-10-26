/* Controller role: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id, text } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const roleModel = require('../models/roleModel');

module.exports = function createRoleController(db) {
  // API ส่ง JSON; ฟอร์มหน้าเว็บ redirect กลับไปหน้ารายการ
  const respond = (req, res, url, data = { ok: true }) =>
    req.originalUrl.startsWith('/api/') ? res.json(data) : res.redirect(url);

  /* แสดงบทบาทพร้อมจำนวนบัญชีที่ใช้งานบทบาทนั้น */
  const list = async (req, res) => {
    const roles = (await roleModel.listWithUserCount(db)).rows;
    if (req.originalUrl.startsWith('/api/'))
      return res.json({
        roles
      });
    res.render('admin/roles', {
      title: 'บทบาทผู้ใช้งาน',
      roles
    });
  };

  /* สร้าง Role ใหม่โดยยังไม่มี Permission; ต้องไปกำหนดที่หน้า ACL */
  const create = async (req, res) => {
    const code = text(req.body.code, 'รหัสบทบาท', 80);
    if (!/^[a-z][a-z0-9_]*$/.test(code))
      throw fail(400, 'รหัสบทบาทใช้ภาษาอังกฤษตัวเล็ก ตัวเลข และ _');
    await transaction(db, async (c) => {
      const role = (
        await roleModel.create(
          c,
          code,
          text(req.body.name, 'ชื่อบทบาท', 100),
          text(req.body.description || '', 'คำอธิบาย', 500, false)
        )
      ).rows[0];
      await audit(c, req, 'role.create', 'role', role.id);
    });
    respond(req, res, '/admin/roles');
  };

  /* แก้ได้เฉพาะชื่อแสดงผลและคำอธิบาย ไม่เปลี่ยน code หรือ is_admin */
  const update = async (req, res) => {
    await transaction(db, async (c) => {
      const role = (
        await roleModel.update(
          c,
          text(req.body.name, 'ชื่อบทบาท', 100),
          text(req.body.description || '', 'คำอธิบาย', 500, false),
          id(req.params.id)
        )
      ).rows[0];
      if (!role) throw fail(404, 'ไม่พบบทบาท');
      await audit(c, req, 'role.update', 'role', role.id);
    });
    respond(req, res, '/admin/roles');
  };

  /* ห้ามลบ Role ของ Admin; Foreign Key กันการลบ Role ที่ยังมีผู้ใช้ */
  const remove = async (req, res) => {
    await transaction(db, async (c) => {
      const role = (await roleModel.findForUpdate(c, id(req.params.id))).rows[0];
      if (!role) throw fail(404, 'ไม่พบบทบาท');
      if (role.is_admin) throw fail(409, 'ไม่สามารถลบบทบาท Admin');
      await roleModel.remove(c, role.id);
      await audit(c, req, 'role.delete', 'role', role.id);
    });
    respond(req, res, '/admin/roles');
  };

  return { list, create, update, remove };
};
