/* Controller permission: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id, text } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const { catalog } = require('../db/catalog');
const permissionModel = require('../models/permissionModel');

module.exports = function createPermissionController(db) {
  // API ส่ง JSON; ฟอร์มหน้าเว็บ redirect กลับไปหน้ารายการ
  const respond = (req, res, url, data = { ok: true }) =>
    req.originalUrl.startsWith('/api/') ? res.json(data) : res.redirect(url);

  /* แสดง Permission ในฐานข้อมูลพร้อม catalog ของฟังก์ชันที่โค้ดรองรับ */
  const list = async (req, res) => {
    const permissions = (await permissionModel.list(db)).rows;
    if (req.originalUrl.startsWith('/api/'))
      return res.json({
        permissions,
        catalog
      });
    res.render('admin/permissions', {
      title: 'รายการสิทธิ์',
      permissions,
      catalog
    });
  };

  /* เพิ่มได้เฉพาะรหัสใน catalog; ไม่ใช่การสร้างฟังก์ชันใหม่โดยอัตโนมัติ */
  const create = async (req, res) => {
    const code = req.body.code;
    if (!Object.hasOwn(catalog, code)) throw fail(400, 'เลือกฟังก์ชันที่ระบบรองรับ');
    await transaction(db, async (c) => {
      const p = (
        await permissionModel.create(
          c,
          code,
          text(req.body.name, 'ชื่อสิทธิ์', 150),
          text(req.body.description || '', 'คำอธิบาย', 500, false)
        )
      ).rows[0];
      await audit(c, req, 'permission.create', 'permission', p.id, 'success', {
        code
      });
    });
    respond(req, res, '/admin/permissions');
  };

  /* แก้ชื่อและคำอธิบายสิทธิ์ โดยคงรหัสที่ใช้เชื่อมกับ Route */
  const update = async (req, res) => {
    await transaction(db, async (c) => {
      const p = (
        await permissionModel.update(
          c,
          text(req.body.name, 'ชื่อสิทธิ์', 150),
          text(req.body.description || '', 'คำอธิบาย', 500, false),
          id(req.params.id)
        )
      ).rows[0];
      if (!p) throw fail(404, 'ไม่พบสิทธิ์');
      await audit(c, req, 'permission.update', 'permission', p.id);
    });
    respond(req, res, '/admin/permissions');
  };

  /* ลบรายการสิทธิ์; ON DELETE CASCADE ถอนการผูกสิทธิ์นี้จากทุก Role */
  const remove = async (req, res) => {
    await transaction(db, async (c) => {
      const p = (await permissionModel.remove(c, id(req.params.id))).rows[0];
      if (!p) throw fail(404, 'ไม่พบสิทธิ์');
      await audit(c, req, 'permission.delete', 'permission', p.id);
    });
    respond(req, res, '/admin/permissions');
  };

  return { list, create, update, remove };
};
