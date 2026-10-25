/* Router จัดการระบบ ใช้ร่วมกันทั้ง /admin (HTML) และ /api/admin (JSON) */
const express = require('express');
const {
  permission,
  fail,
  id,
  text,
  date,
  transaction,
  audit
} = require('../middleware/security');
const {
  catalog
} = require('../db/catalog');
module.exports = function(db) {
  const r = express.Router();

  /* ต้องมีสิทธิ์จัดการอย่างน้อยหนึ่งรายการก่อนเข้าส่วนนี้; แต่ละ Route ตรวจสิทธิ์เฉพาะซ้ำ */
  r.use(permission('user.manage', 'role.manage', 'permission.manage', 'acl.manage', 'log.read'));

  /* คำขอ API ตอบ JSON ส่วนฟอร์มหน้าเว็บใช้ redirect กลับไปหน้ารายการ */
  const respond = (req, res, url, data = {
    ok: true
  }) => req.originalUrl.startsWith('/api/') ? res.json(data) : res.redirect(url);

  /* เลือกหน้าแรกของส่วนจัดการตามสิทธิ์ที่บัญชีมี */
  r.get('/', (req, res) => {
    const pages = {
      'user.manage': 'users',
      'role.manage': 'roles',
      'permission.manage': 'permissions',
      'acl.manage': 'acl',
      'log.read': 'logs'
    };
    const first = Object.keys(pages).find(code => req.user.is_admin || req.user.permissions
      .includes(code));
    res.redirect('/admin/' + pages[first]);
  });

  /* แสดงบัญชีและบทบาท; ไม่ส่ง password_hash ไปให้หน้าเว็บหรือ API */
  r.get('/users', permission('user.manage'), async (req, res) => {
    const users = (await db.query(
      'SELECT u.id,u.username,u.full_name,u.role_id,u.is_active,r.name AS role_name FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id'
    )).rows;
    const roles = (await db.query('SELECT * FROM roles ORDER BY id')).rows;
    if (req.originalUrl.startsWith('/api/')) return res.json({
      users,
      roles
    });
    res.render('admin/users', {
      title: 'จัดการผู้ใช้',
      users,
      roles
    });
  });

  /* แก้ชื่อและ Role โดยป้องกันการลดสิทธิ์ Admin คนสุดท้าย */
  r.post('/users/:id/edit', permission('user.manage'), async (req, res) => {
    await transaction(db, async c => {
      // Serialize mutations that can remove the last active administrator.
      await c.query('SELECT id FROM roles WHERE is_admin=TRUE FOR UPDATE');
      const u = (await c.query(
        'SELECT u.*,r.is_admin FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u',
        [id(req.params.id)])).rows[0];
      if (!u) throw fail(404, 'ไม่พบผู้ใช้');
      const role = (await c.query('SELECT * FROM roles WHERE id=$1', [id(req.body
        .role_id)])).rows[0];
      if (!role) throw fail(400, 'ไม่พบบทบาท');
      if ((role.is_admin || u.is_admin) && !req.user.is_admin) throw fail(403,
        'เฉพาะ Admin เท่านั้นที่แก้ไขบัญชี Admin ได้');

      /* คงสถานะบัญชีเดิม; ฟอร์มปัจจุบันไม่ได้เปิดให้เปลี่ยน is_active */
      const active = u.is_active;
      if (u.is_admin && u.is_active && (!role.is_admin || !active)) {
        const n = Number((await c.query(
          'SELECT count(*) AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.is_admin AND u.is_active'
        )).rows[0].n);
        if (n <= 1) throw fail(409, 'ต้องมี Admin ที่เปิดใช้งานอย่างน้อยหนึ่งคน');
      }
      await c.query(
        'UPDATE users SET full_name=$1,role_id=$2,is_active=$3 WHERE id=$4', [text(
          req.body.full_name, 'ชื่อ', 150), role.id, active, u.id]);
      await audit(c, req, 'user.update', 'user', u.id, 'success', {
        previous_role: u.role_id,
        role: role.id,
        active
      });
    });
    respond(req, res, '/admin/users');
  });

  /* ลบบัญชีถาวรหลังยืนยันชื่อ; ห้ามลบตนเอง Admin คนสุดท้าย หรือบัญชีที่มีข้อมูลคลินิก */
  r.post('/users/:id/delete', permission('user.manage'), async (req, res) => {
    await transaction(db, async c => {
      await c.query('SELECT id FROM roles WHERE is_admin=TRUE FOR UPDATE');
      const u = (await c.query(
        'SELECT u.*,r.is_admin FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 FOR UPDATE OF u',
        [id(req.params.id)])).rows[0];
      if (!u) throw fail(404, 'ไม่พบผู้ใช้');
      if (u.is_admin && !req.user.is_admin) throw fail(403,
        'เฉพาะ Admin เท่านั้นที่ลบบัญชี Admin ได้');
      if (u.is_admin && u.is_active) {
        const count = Number((await c.query(
          'SELECT count(*) AS n FROM users u JOIN roles r ON r.id=u.role_id WHERE r.is_admin AND u.is_active'
        )).rows[0].n);
        if (count <= 1) throw fail(409, 'ไม่สามารถลบ Admin ที่เปิดใช้งานคนสุดท้าย');
      }
      if (u.id === req.user.id) throw fail(409,
        'ไม่สามารถลบบัญชีที่กำลังใช้งาน กรุณาใช้บัญชี Admin อื่น');
      if (req.body.confirm_username !== u.username) throw fail(400,
        'กรุณาพิมพ์ชื่อผู้ใช้ให้ตรงเพื่อยืนยันการลบบัญชี');

      /* ตรวจข้อมูลที่อ้างถึงบัญชีก่อนลบ เพื่อไม่ให้สัตว์ นัด ผลตรวจ หรือไฟล์สูญเสียผู้เกี่ยวข้อง */
      const linked = (await c.query(`SELECT
        EXISTS(SELECT 1 FROM pets WHERE owner_id=$1) OR
        EXISTS(SELECT 1 FROM appointments WHERE vet_id=$1) OR
        EXISTS(SELECT 1 FROM visit_records WHERE vet_id=$1) OR
        EXISTS(SELECT 1 FROM files WHERE uploaded_by=$1) AS found`, [u.id])).rows[0].found;
      if (linked) throw fail(409,
        'ลบบัญชีไม่ได้ เพราะมีสัตว์เลี้ยง นัดหมาย ผลตรวจ หรือไฟล์ที่เกี่ยวข้อง กรุณาจัดการข้อมูลเหล่านั้นก่อน'
        );
      // Keep the audit trail readable without retaining a foreign key to a deleted account.

      /* คงประวัติ Log แต่ตัดการอ้างอิงบัญชีที่ลบ และเก็บชื่อ/รหัสเดิมไว้ */
      await c.query(`UPDATE audit_logs SET user_id=NULL,
        username_attempted=COALESCE(username_attempted,$2),
        detail=detail || jsonb_build_object('deleted_user_id',$1::integer)
        WHERE user_id=$1`, [u.id, u.username]);
      await c.query("DELETE FROM session WHERE sess->>'userId'=$1", [String(u.id)]);
      await c.query('DELETE FROM users WHERE id=$1', [u.id]);
      await audit(c, req, 'user.delete', 'user', u.id, 'success', {
        username: u.username
      });
    });
    respond(req, res, '/admin/users');
  });

  /* แสดงบทบาทพร้อมจำนวนบัญชีที่ใช้งานบทบาทนั้น */
  r.get('/roles', permission('role.manage'), async (req, res) => {
    const roles = (await db.query(
      'SELECT r.*, (SELECT count(*) FROM users u WHERE u.role_id=r.id) AS user_count FROM roles r ORDER BY id'
    )).rows;
    if (req.originalUrl.startsWith('/api/')) return res.json({
      roles
    });
    res.render('admin/roles', {
      title: 'บทบาทผู้ใช้งาน',
      roles
    });
  });

  /* สร้าง Role ใหม่โดยยังไม่มี Permission; ต้องไปกำหนดที่หน้า ACL */
  r.post('/roles', permission('role.manage'), async (req, res) => {
    const code = text(req.body.code, 'รหัสบทบาท', 80);
    if (!/^[a-z][a-z0-9_]*$/.test(code)) throw fail(400,
      'รหัสบทบาทใช้ภาษาอังกฤษตัวเล็ก ตัวเลข และ _');
    await transaction(db, async c => {
      const role = (await c.query(
        'INSERT INTO roles(code,name,description) VALUES($1,$2,$3) RETURNING id',
        [code, text(req.body.name, 'ชื่อบทบาท', 100), text(req.body.description ||
          '', 'คำอธิบาย', 500, false)])).rows[0];
      await audit(c, req, 'role.create', 'role', role.id);
    });
    respond(req, res, '/admin/roles');
  });

  /* แก้ได้เฉพาะชื่อแสดงผลและคำอธิบาย ไม่เปลี่ยน code หรือ is_admin */
  r.post('/roles/:id/edit', permission('role.manage'), async (req, res) => {
    await transaction(db, async c => {
      const role = (await c.query(
        'UPDATE roles SET name=$1,description=$2 WHERE id=$3 RETURNING id', [text(
          req.body.name, 'ชื่อบทบาท', 100), text(req.body.description || '',
          'คำอธิบาย', 500, false), id(req.params.id)])).rows[0];
      if (!role) throw fail(404, 'ไม่พบบทบาท');
      await audit(c, req, 'role.update', 'role', role.id);
    });
    respond(req, res, '/admin/roles');
  });

  /* ห้ามลบ Role ของ Admin; Foreign Key กันการลบ Role ที่ยังมีผู้ใช้ */
  r.post('/roles/:id/delete', permission('role.manage'), async (req, res) => {
    await transaction(db, async c => {
      const role = (await c.query('SELECT * FROM roles WHERE id=$1 FOR UPDATE', [id(
        req.params.id)])).rows[0];
      if (!role) throw fail(404, 'ไม่พบบทบาท');
      if (role.is_admin) throw fail(409, 'ไม่สามารถลบบทบาท Admin');
      await c.query('DELETE FROM roles WHERE id=$1', [role.id]);
      await audit(c, req, 'role.delete', 'role', role.id);
    });
    respond(req, res, '/admin/roles');
  });

  /* แสดง Permission ในฐานข้อมูลพร้อม catalog ของฟังก์ชันที่โค้ดรองรับ */
  r.get('/permissions', permission('permission.manage'), async (req, res) => {
    const permissions = (await db.query('SELECT * FROM permissions ORDER BY code')).rows;
    if (req.originalUrl.startsWith('/api/')) return res.json({
      permissions,
      catalog
    });
    res.render('admin/permissions', {
      title: 'รายการสิทธิ์',
      permissions,
      catalog
    });
  });

  /* เพิ่มได้เฉพาะรหัสใน catalog; ไม่ใช่การสร้างฟังก์ชันใหม่โดยอัตโนมัติ */
  r.post('/permissions', permission('permission.manage'), async (req, res) => {
    const code = req.body.code;
    if (!Object.hasOwn(catalog, code)) throw fail(400, 'เลือกฟังก์ชันที่ระบบรองรับ');
    await transaction(db, async c => {
      const p = (await c.query(
        'INSERT INTO permissions(code,name,description) VALUES($1,$2,$3) RETURNING id',
        [code, text(req.body.name, 'ชื่อสิทธิ์', 150), text(req.body
          .description || '', 'คำอธิบาย', 500, false)])).rows[0];
      await audit(c, req, 'permission.create', 'permission', p.id, 'success', {
        code
      });
    });
    respond(req, res, '/admin/permissions');
  });

  /* แก้ชื่อและคำอธิบายสิทธิ์ โดยคงรหัสที่ใช้เชื่อมกับ Route */
  r.post('/permissions/:id/edit', permission('permission.manage'), async (req, res) => {
    await transaction(db, async c => {
      const p = (await c.query(
        'UPDATE permissions SET name=$1,description=$2 WHERE id=$3 RETURNING id',
        [text(req.body.name, 'ชื่อสิทธิ์', 150), text(req.body.description || '',
          'คำอธิบาย', 500, false), id(req.params.id)])).rows[0];
      if (!p) throw fail(404, 'ไม่พบสิทธิ์');
      await audit(c, req, 'permission.update', 'permission', p.id);
    });
    respond(req, res, '/admin/permissions');
  });

  /* ลบรายการสิทธิ์; ON DELETE CASCADE ถอนการผูกสิทธิ์นี้จากทุก Role */
  r.post('/permissions/:id/delete', permission('permission.manage'), async (req, res) => {
    await transaction(db, async c => {
      const p = (await c.query('DELETE FROM permissions WHERE id=$1 RETURNING id', [
        id(req.params.id)
      ])).rows[0];
      if (!p) throw fail(404, 'ไม่พบสิทธิ์');
      await audit(c, req, 'permission.delete', 'permission', p.id);
    });
    respond(req, res, '/admin/permissions');
  });

  /* อ่าน Role, Permission และตารางเชื่อม เพื่อนำไปสร้างตารางสิทธิ์ */
  r.get('/acl', permission('acl.manage'), async (req, res) => {
    const roles = (await db.query('SELECT * FROM roles ORDER BY id')).rows;
    const permissions = (await db.query('SELECT * FROM permissions ORDER BY code')).rows;
    const grants = (await db.query('SELECT * FROM role_permissions')).rows;
    if (req.originalUrl.startsWith('/api/')) return res.json({
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
  });

  /* ให้หรือถอน Permission ของ Role ตาม enabled; Admin มีสิทธิ์อัตโนมัติจึงไม่ใช้สวิตช์ */
  r.post('/acl', permission('acl.manage'), async (req, res) => {
    const roleId = id(req.body.role_id),
      permissionId = id(req.body.permission_id);
    const enabled = req.body.enabled === '1';
    await transaction(db, async c => {
      const role = (await c.query('SELECT * FROM roles WHERE id=$1', [roleId])).rows[
        0];
      if (!role) throw fail(404, 'ไม่พบบทบาท');
      if (role.is_admin) throw fail(409, 'Admin มีสิทธิ์ทุกฟังก์ชันโดยอัตโนมัติ');
      // Only Admin may delegate management privileges, preventing indirect Admin takeover.
      const p = (await c.query('SELECT code FROM permissions WHERE id=$1', [
        permissionId
      ])).rows[0];
      if (!p) throw fail(404, 'ไม่พบสิทธิ์');
      if (!req.user.is_admin && ['user.manage', 'role.manage', 'permission.manage',
          'acl.manage'
        ].includes(p.code)) throw fail(403, 'เฉพาะ Admin ที่มอบสิทธิ์จัดการระบบได้');
      if (enabled) await c.query(
        'INSERT INTO role_permissions VALUES($1,$2) ON CONFLICT DO NOTHING', [
          roleId, permissionId
        ]);
      else await c.query(
        'DELETE FROM role_permissions WHERE role_id=$1 AND permission_id=$2', [
          roleId, permissionId
        ]);
      await audit(c, req, 'acl.update', 'role', roleId, 'success', {
        permission: p.code,
        enabled
      });
    });
    respond(req, res, '/admin/acl');
  });

  /* ค้น Log ตามวันที่ไทย ผู้ใช้ และเหตุการณ์ แสดงล่าสุดไม่เกิน 300 รายการ */
  r.get('/logs', permission('log.read'), async (req, res) => {
    const clauses = [],
      params = [];

    /* ประกอบเงื่อนไขค้นหาพร้อมพารามิเตอร์ $1, $2 เพื่อไม่ต่อค่าผู้ใช้ลง SQL โดยตรง */
    const add = (sql, v) => {
      params.push(v);
      clauses.push(sql.replace('?', `$${params.length}`));
    };
    if (req.query.from) add(
      'l.created_at >= ?::date::timestamp AT TIME ZONE \'Asia/Bangkok\'', date(req.query
        .from));
    if (req.query.to) add(
      "l.created_at < (?::date + INTERVAL '1 day') AT TIME ZONE 'Asia/Bangkok'", date(req
        .query.to));
    if (req.query.user_id) add('l.user_id = ?', id(req.query.user_id));
    if (req.query.event) add('l.event_type = ?', text(req.query.event, 'เหตุการณ์', 100));
    const logs = (await db.query(
      `SELECT l.*,u.username FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY l.id DESC LIMIT 300`,
      params)).rows;
    const users = (await db.query('SELECT id,username FROM users ORDER BY username')).rows;
    const events = (await db.query(
      'SELECT DISTINCT event_type FROM audit_logs ORDER BY event_type')).rows;
    if (req.originalUrl.startsWith('/api/')) return res.json({
      logs
    });
    res.render('admin/logs', {
      title: 'บันทึกกิจกรรม',
      logs,
      users,
      events,
      filters: req.query
    });
  });
  return r;
};
