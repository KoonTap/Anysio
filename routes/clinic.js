/* Router งานคลินิก ผูกกับ /app ใน server.js; ใช้ Model ตรวจขอบเขตข้อมูล */
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  login,
  permission,
  has,
  any,
  fail,
  id,
  text,
  date,
  slot,
  transaction,
  audit,
  csrf
} = require('../middleware/security');
const {
  appointmentScope,
  appointment,
  canVisit
} = require('../models/clinic');
module.exports = function(db, uploadDir) {
  const r = express.Router();

  /* ทุก Route ในส่วนคลินิกต้องเข้าสู่ระบบก่อน */
  r.use(login);

  /* Dashboard: อ่านนัดเฉพาะที่ผู้ใช้มีสิทธิ์ แล้วส่งให้ EJS สรุปสถานะ */
  r.get('/', async (req, res) => {
    const scope = appointmentScope(req.user);
    const rows = (await db.query(
      `SELECT a.*,p.name AS pet_name,v.full_name AS vet_name FROM appointments a JOIN pets p ON p.id=a.pet_id LEFT JOIN users v ON v.id=a.vet_id WHERE ${scope.sql} ORDER BY a.scheduled_at DESC`,
      scope.args)).rows;
    res.render('dashboard', {
      title: 'ภาพรวมคลินิก',
      appointments: rows
    });
  });

  /* แสดงสัตว์ตามสิทธิ์: ทั้งหมด / ของตน / ที่มีนัดมอบหมายให้ตน */
  r.get('/pets', permission('pet.read.own', 'pet.read.all', 'pet.read.assigned'), async (req,
    res) => {
    const u = req.user;
    const all = has(u, 'pet.read.all');
    const clauses = [];
    if (has(u, 'pet.read.own')) clauses.push('p.owner_id=$1');
    if (has(u, 'pet.read.assigned')) clauses.push(
      'EXISTS(SELECT 1 FROM appointments a WHERE a.pet_id=p.id AND a.vet_id=$1)');
    const pets = (await db.query(
      `SELECT p.*,u.full_name AS owner_name FROM pets p JOIN users u ON u.id=p.owner_id WHERE ${all?'TRUE':clauses.length?'('+clauses.join(' OR ')+')':'FALSE'} ORDER BY p.id DESC`,
      all || !clauses.length ? [] : [u.id])).rows;
    res.render('pets', {
      title: 'สัตว์เลี้ยง',
      pets
    });
  });

  /* เพิ่มสัตว์และ Log ใน Transaction เดียวกัน โดยใช้ผู้ที่ Login เป็นเจ้าของ */
  r.post('/pets', permission('pet.create'), async (req, res) => {
    const b = req.body;
    const species = text(b.species, 'ประเภท', 10);
    if (!['dog', 'cat', 'other'].includes(species)) throw fail(400,
      'ประเภทสัตว์ไม่ถูกต้อง');
    const birth = date(b.birth_date);
    if (birth && new Date(birth) > new Date()) throw fail(400, 'วันเกิดต้องไม่อยู่ในอนาคต');
    await transaction(db, async c => {
      const pet = (await c.query(
        'INSERT INTO pets(owner_id,name,species,breed,birth_date,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [req.user.id, text(b.name, 'ชื่อสัตว์', 100), species, text(b.breed || '',
          'สายพันธุ์', 100, false), birth, text(b.note || '', 'หมายเหตุ', 1000,
          false)])).rows[0];
      await audit(c, req, 'pet.create', 'pet', pet.id);
    });
    res.redirect('/app/pets');
  });

  /* แก้สัตว์: ล็อกแถว ตรวจเจ้าของและข้อมูลก่อน UPDATE; Admin แก้ข้ามเจ้าของได้ */
  r.post('/pets/:id/edit', permission('pet.update.own'), async (req, res) => {
    await transaction(db, async c => {
      const pet = (await c.query('SELECT * FROM pets WHERE id=$1 FOR UPDATE', [id(req
        .params.id)])).rows[0];
      if (!pet) throw fail(404, 'ไม่พบสัตว์เลี้ยง');
      if (!req.user.is_admin && pet.owner_id !== req.user.id) throw fail(403,
        'แก้ไขได้เฉพาะสัตว์เลี้ยงของตน');
      const b = req.body;
      const species = text(b.species, 'ประเภท', 10);
      if (!['dog', 'cat', 'other'].includes(species)) throw fail(400,
        'ประเภทไม่ถูกต้อง');
      const birth = date(b.birth_date);
      if (birth && new Date(birth) > new Date()) throw fail(400, 'วันเกิดไม่ถูกต้อง');
      await c.query(
        'UPDATE pets SET name=$1,species=$2,breed=$3,birth_date=$4,note=$5 WHERE id=$6',
        [text(b.name, 'ชื่อสัตว์', 100), species, text(b.breed || '', 'สายพันธุ์',
          100, false), birth, text(b.note || '', 'หมายเหตุ', 1000, false), pet.id]);
      await audit(c, req, 'pet.update', 'pet', pet.id);
    });
    res.redirect('/app/pets');
  });

  /* ลบสัตว์ของตน; Foreign Key ในฐานข้อมูลจะกันการลบสัตว์ที่มีนัดอยู่ */
  r.post('/pets/:id/delete', permission('pet.delete.own'), async (req, res) => {
    await transaction(db, async c => {
      const pet = (await c.query('SELECT * FROM pets WHERE id=$1 FOR UPDATE', [id(req
        .params.id)])).rows[0];
      if (!pet) throw fail(404, 'ไม่พบสัตว์เลี้ยง');
      if (!req.user.is_admin && pet.owner_id !== req.user.id) throw fail(403,
        'ลบได้เฉพาะสัตว์เลี้ยงของตน');
      await c.query('DELETE FROM pets WHERE id=$1', [pet.id]);
      await audit(c, req, 'pet.delete', 'pet', pet.id);
    });
    res.redirect('/app/pets');
  });

  /* แสดงรายการนัดและสัตว์ที่เลือกขอนัดได้ ตามขอบเขตสิทธิ์ผู้ใช้ */
  r.get('/appointments', permission('appointment.read.own', 'appointment.read.all',
    'appointment.read.assigned'), async (req, res) => {
    const scope = appointmentScope(req.user);
    const appointments = (await db.query(
      `SELECT a.*,p.name AS pet_name,v.full_name AS vet_name FROM appointments a JOIN pets p ON p.id=a.pet_id LEFT JOIN users v ON v.id=a.vet_id WHERE ${scope.sql} ORDER BY a.scheduled_at DESC`,
      scope.args)).rows;
    const pets = (await db.query(
      `SELECT id,name FROM pets WHERE ${req.user.is_admin?'TRUE':'owner_id=$1'} ORDER BY name`,
      req.user.is_admin ? [] : [req.user.id])).rows;
    res.render('appointments', {
      title: 'นัดหมาย',
      appointments,
      pets
    });
  });

  /* สร้างนัดสถานะ pending หลังตรวจเจ้าของสัตว์และช่วงเวลา; ดัชนีฐานข้อมูลกันคิวซ้ำ */
  r.post('/appointments', permission('appointment.create'), async (req, res) => {
    const petId = id(req.body.pet_id);
    const p = (await db.query('SELECT * FROM pets WHERE id=$1', [petId])).rows[0];
    if (!p) throw fail(404, 'ไม่พบสัตว์เลี้ยง');
    if (!req.user.is_admin && p.owner_id !== req.user.id) throw fail(403,
      'ขอนัดได้เฉพาะสัตว์เลี้ยงของตน');
    let appointmentId;
    await transaction(db, async c => {
      const a = (await c.query(
        'INSERT INTO appointments(pet_id,scheduled_at,reason) VALUES($1,$2,$3) RETURNING id',
        [petId, slot(req.body.scheduled_at), text(req.body.reason,
          'อาการหรือเหตุผล', 1500)])).rows[0];
      appointmentId = a.id;
      await audit(c, req, 'appointment.create', 'appointment', a.id);
    });
    res.redirect('/app/appointments/' + appointmentId);
  });

  /* หน้ารายละเอียด: ตรวจสิทธิ์เข้าถึงนัด และแยกสิทธิ์อ่านผลตรวจ/ภาพอีกครั้ง */
  r.get('/appointments/:id', permission('appointment.read.own', 'appointment.read.all',
    'appointment.read.assigned'), async (req, res) => {
    const a = await appointment(db, req.user, id(req.params.id));
    const visit = canVisit(req.user, a) ? (await db.query(
      'SELECT * FROM visit_records WHERE appointment_id=$1', [a.id])).rows[0] : null;
    const files = has(req.user, 'file.read') ? (await db.query(
      'SELECT * FROM files WHERE appointment_id=$1 ORDER BY id DESC', [a.id])).rows : [];

    /* ตัวเลือกผู้ตรวจต้องเปิดใช้งาน มี visit.create และไม่ใช่ Admin */
    const vets = has(req.user, 'appointment.confirm') ? (await db.query(
      "SELECT DISTINCT u.id,u.full_name FROM users u JOIN roles r ON r.id=u.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE u.is_active AND NOT r.is_admin AND p.code='visit.create' ORDER BY u.full_name"
    )).rows : [];
    res.render('appointment', {
      title: 'รายละเอียดนัด #' + a.id,
      a,
      visit,
      files,
      vets,
      canVisit: canVisit(req.user, a)
    });
  });

  /* เปลี่ยนสถานะนัดตาม action โดยตรวจ Permission ขอบเขตนัด และสถานะเดิม */
  r.post('/appointments/:id/status', async (req, res) => {
    const action = req.body.action;
    const codes = {
      confirm: 'appointment.confirm',
      reject: 'appointment.reject',
      checkin: 'appointment.checkin',
      cancel: 'appointment.cancel.own'
    };
    if (!codes[action]) throw fail(400, 'การกระทำไม่ถูกต้อง');
    if (!has(req.user, codes[action])) throw fail(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะนี้');
    await transaction(db, async c => {
      await c.query('SELECT id FROM appointments WHERE id=$1 FOR UPDATE', [id(req
        .params.id)]);
      const a = await appointment(c, req.user, id(req.params.id));
      if (action === 'cancel' && !req.user.is_admin && a.owner_id !== req.user.id)
        throw fail(403, 'ยกเลิกได้เฉพาะนัดของตน');

      /* กฎสถานะ: ยืนยัน/ปฏิเสธจาก pending, เช็กอินจาก confirmed, ยกเลิกจาก pending หรือ confirmed */
      const allowed = {
        confirm: ['pending'],
        reject: ['pending'],
        checkin: ['confirmed'],
        cancel: ['pending', 'confirmed']
      };
      if (!allowed[action].includes(a.status)) throw fail(409,
        'สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้');
      let vetId = a.vet_id;
      let reason = '';

      /* ยืนยันนัดต้องเลือกผู้ตรวจที่มีสิทธิ์และนัดยังไม่เลยเวลา */
      if (action === 'confirm') {
        vetId = id(req.body.vet_id);
        const vet = (await c.query(
          "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.is_active AND NOT r.is_admin AND EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id AND p.code='visit.create')",
          [vetId])).rows[0];
        if (!vet) throw fail(400, 'เลือกผู้ตรวจที่เปิดใช้งานและมีสิทธิ์บันทึกผลตรวจ');
        if (new Date(a.scheduled_at) <= new Date()) throw fail(400,
          'นัดนี้เลยเวลาแล้ว กรุณาสร้างนัดใหม่');
      }
      if (action === 'reject') reason = text(req.body.reject_reason,
        'เหตุผลที่ปฏิเสธ', 1000);
      const status = {
        confirm: 'confirmed',
        reject: 'rejected',
        checkin: 'checked_in',
        cancel: 'cancelled'
      } [action];
      await c.query(
        'UPDATE appointments SET status=$1,vet_id=$2,reject_reason=$3,updated_at=now() WHERE id=$4',
        [status, vetId, reason, a.id]);
      await audit(c, req, 'appointment.' + action, 'appointment', a.id, 'success', {
        from: a.status,
        to: status
      });
    });
    res.redirect('/app/appointments/' + req.params.id);
  });

  /* บันทึก/แก้ผลตรวจเฉพาะแพทย์ที่รับมอบหมายหรือ Admin; บันทึกพร้อมเปลี่ยนนัดเป็น completed */
  r.post('/appointments/:id/visit', async (req, res) => {
    await transaction(db, async c => {
      await c.query('SELECT id FROM appointments WHERE id=$1 FOR UPDATE', [id(req
        .params.id)]);
      const a = await appointment(c, req.user, id(req.params.id));
      if (!req.user.is_admin && a.vet_id !== req.user.id) throw fail(403,
        'บันทึกผลได้เฉพาะนัดที่ได้รับมอบหมาย');
      const existing = (await c.query(
        'SELECT id FROM visit_records WHERE appointment_id=$1', [a.id])).rows[0];
      if (!has(req.user, existing ? 'visit.update' : 'visit.create')) throw fail(403,
        'ไม่มีสิทธิ์บันทึกผลตรวจ');
      if (existing ? a.status !== 'completed' : a.status !== 'checked_in') throw fail(
        409, 'ต้องเช็กอินก่อนบันทึกผลตรวจ');
      const values = [text(req.body.diagnosis, 'ผลวินิจฉัย', 3000), text(req.body
        .treatment, 'การรักษา', 3000), date(req.body.follow_up_date)];
      if (existing) await c.query(
        'UPDATE visit_records SET diagnosis=$1,treatment=$2,follow_up_date=$3,updated_at=now() WHERE id=$4',
        [...values, existing.id]);
      else await c.query(
        'INSERT INTO visit_records(diagnosis,treatment,follow_up_date,appointment_id,vet_id) VALUES($1,$2,$3,$4,$5)',
        [...values, a.id, a.vet_id]);
      await c.query(
        "UPDATE appointments SET status='completed',updated_at=now() WHERE id=$1", [
          a.id
        ]);
      await audit(c, req, existing ? 'visit.update' : 'visit.create', 'appointment', a
        .id);
    });
    res.redirect('/app/appointments/' + req.params.id);
  });

  /* Multer อ่านภาพเข้า RAM ครั้งละหนึ่งไฟล์ ไม่เกิน 5 MB ก่อนตรวจภาพจริง */
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 2,
      parts: 3
    }
  });

  /* ตรวจสิทธิ์นัดก่อนรับไฟล์ จากนั้นอ่าน multipart และตรวจ CSRF ก่อนบันทึก */
  r.post('/appointments/:id/files', permission('file.upload'), async (req, res, next) => {
    req.appointment = await appointment(db, req.user, id(req.params.id));
    if (req.appointment.status === 'completed' && !req.user.is_admin) throw fail(409,
      'นัดที่ตรวจเสร็จแล้วไม่รับภาพเพิ่มเติม');
    next();
  }, upload.single('image'), csrf, async (req, res) => {
    const f = req.file;
    if (!f || !f.size) throw fail(400, 'กรุณาเลือกภาพ JPG หรือ PNG');
    let png;
    let imageBuffer;
    try {

      /* ใช้ sharp ถอดรหัสและสร้างภาพใหม่ ปฏิเสธภาพเสีย/ชนิดอื่น และจำกัด 25 ล้านพิกเซล */
      const image = sharp(f.buffer, {
        failOn: 'warning',
        limitInputPixels: 25_000_000
      });
      const metadata = await image.metadata();
      if (!['jpeg', 'png'].includes(metadata.format)) throw new Error(
        'Unsupported image format');
      png = metadata.format === 'png';
      // Decode and re-encode the pixels; reading metadata alone does not detect damaged images.
      imageBuffer = await image.rotate().toFormat(png ? 'png' : 'jpeg').toBuffer();
    } catch {
      throw fail(400,
        'ไฟล์ภาพไม่สมบูรณ์ ไม่ใช่ JPG/PNG หรือมีขนาดเกิน 25 ล้านพิกเซล กรุณาเลือกภาพใหม่'
        );
    }
    if (imageBuffer.length > 5 * 1024 * 1024) throw fail(400,
      'ภาพหลังประมวลผลมีขนาดเกิน 5 MB กรุณาเลือกภาพที่เล็กลง');

    /* ตั้งชื่อไฟล์ใหม่ด้วย UUID ป้องกันชื่อชนกัน; เก็บไฟล์จริงนอก public */
    const stored = crypto.randomUUID() + (png ? '.png' : '.jpg');
    const dest = path.join(uploadDir, stored);
    await fs.writeFile(dest, imageBuffer, {
      flag: 'wx'
    });
    try {
      await transaction(db, async c => {
        const file = (await c.query(
          'INSERT INTO files(appointment_id,uploaded_by,original_name,stored_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
          [req.appointment.id, req.user.id, path.basename(f.originalname).slice(
              0, 200), stored, png ? 'image/png' : 'image/jpeg', imageBuffer
            .length
          ])).rows[0];
        await audit(c, req, 'file.upload', 'file', file.id);
      });

      /* ถ้าบันทึกข้อมูลไฟล์ลงฐานข้อมูลไม่สำเร็จ ให้ลบไฟล์ที่เพิ่งเขียนเพื่อลดไฟล์ตกค้าง */
    } catch (e) {
      await fs.unlink(dest).catch(() => {});
      throw e;
    }
    res.redirect('/app/appointments/' + req.appointment.id);
  });

  /* เปิดภาพผ่าน Route ที่ตรวจสิทธิ์นัด; download=1 รองรับดาวน์โหลดแม้หน้าเว็บไม่มีลิงก์แล้ว */
  r.get('/files/:id', permission('file.read'), async (req, res) => {
    const f = (await db.query('SELECT * FROM files WHERE id=$1', [id(req.params.id)])).rows[
      0];
    if (!f) throw fail(404, 'ไม่พบไฟล์');
    await appointment(db, req.user, f.appointment_id);
    if (path.basename(f.stored_name) !== f.stored_name) throw fail(400,
      'เส้นทางไฟล์ไม่ถูกต้อง');
    res.type(f.mime_type);
    if (req.query.download === '1') return res.download(path.join(uploadDir, f.stored_name),
      f.original_name);
    res.sendFile(path.join(uploadDir, f.stored_name));
  });

  /* ลบได้เมื่อมีสิทธิ์ และเป็นผู้ที่อัปโหลดก่อนตรวจเสร็จ; Admin ข้ามข้อจำกัดนี้ได้ */
  r.post('/files/:id/delete', permission('file.delete'), async (req, res) => {
    let file;
    await transaction(db, async c => {
      file = (await c.query('SELECT * FROM files WHERE id=$1 FOR UPDATE', [id(req
        .params.id)])).rows[0];
      if (!file) throw fail(404, 'ไม่พบไฟล์');
      const a = await appointment(c, req.user, file.appointment_id);
      if (!req.user.is_admin && (file.uploaded_by !== req.user.id || a.status ===
          'completed')) throw fail(403, 'ลบได้เฉพาะภาพที่ตนอัปโหลดก่อนตรวจเสร็จ');
      await c.query('DELETE FROM files WHERE id=$1', [file.id]);
      await audit(c, req, 'file.delete', 'file', file.id);
    });
    if (path.basename(file.stored_name) === file.stored_name) await fs.unlink(path.join(
      uploadDir, file.stored_name)).catch(() => {});
    res.redirect('/app/appointments/' + file.appointment_id);
  });
  return r;
};
