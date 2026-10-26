/* Controller file: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const { appointment } = require('../services/clinicAccess');
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const fileModel = require('../models/fileModel');

module.exports = function createFileController(db, uploadDir) {
  /* ตรวจสิทธิ์นัดก่อนรับไฟล์ จากนั้นอ่าน multipart และตรวจ CSRF ก่อนบันทึก */
  const upload = async (req, res) => {
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
      if (!['jpeg', 'png'].includes(metadata.format)) throw new Error('Unsupported image format');
      png = metadata.format === 'png';
      // Decode and re-encode the pixels; reading metadata alone does not detect damaged images.
      imageBuffer = await image
        .rotate()
        .toFormat(png ? 'png' : 'jpeg')
        .toBuffer();
    } catch {
      throw fail(
        400,
        'ไฟล์ภาพไม่สมบูรณ์ ไม่ใช่ JPG/PNG หรือมีขนาดเกิน 25 ล้านพิกเซล กรุณาเลือกภาพใหม่'
      );
    }
    if (imageBuffer.length > 5 * 1024 * 1024)
      throw fail(400, 'ภาพหลังประมวลผลมีขนาดเกิน 5 MB กรุณาเลือกภาพที่เล็กลง');

    /* ตั้งชื่อไฟล์ใหม่ด้วย UUID ป้องกันชื่อชนกัน; เก็บไฟล์จริงนอก public */
    const stored = crypto.randomUUID() + (png ? '.png' : '.jpg');
    const dest = path.join(uploadDir, stored);
    await fs.writeFile(dest, imageBuffer, {
      flag: 'wx'
    });
    try {
      await transaction(db, async (c) => {
        const file = (
          await fileModel.create(
            c,
            req.appointment.id,
            req.user.id,
            path.basename(f.originalname).slice(0, 200),
            stored,
            png ? 'image/png' : 'image/jpeg',
            imageBuffer.length
          )
        ).rows[0];
        await audit(c, req, 'file.upload', 'file', file.id);
      });

      /* ถ้าบันทึกข้อมูลไฟล์ลงฐานข้อมูลไม่สำเร็จ ให้ลบไฟล์ที่เพิ่งเขียนเพื่อลดไฟล์ตกค้าง */
    } catch (e) {
      await fs.unlink(dest).catch(() => {});
      throw e;
    }
    res.redirect('/app/appointments/' + req.appointment.id);
  };

  /* เปิดภาพผ่าน Route ที่ตรวจสิทธิ์นัด; download=1 รองรับดาวน์โหลดแม้หน้าเว็บไม่มีลิงก์แล้ว */
  const show = async (req, res) => {
    const f = (await fileModel.findById(db, id(req.params.id))).rows[0];
    if (!f) throw fail(404, 'ไม่พบไฟล์');
    await appointment(db, req.user, f.appointment_id);
    if (path.basename(f.stored_name) !== f.stored_name) throw fail(400, 'เส้นทางไฟล์ไม่ถูกต้อง');
    res.type(f.mime_type);
    if (req.query.download === '1')
      return res.download(path.join(uploadDir, f.stored_name), f.original_name);
    res.sendFile(path.join(uploadDir, f.stored_name));
  };

  /* ลบได้เมื่อมีสิทธิ์ และเป็นผู้ที่อัปโหลดก่อนตรวจเสร็จ; Admin ข้ามข้อจำกัดนี้ได้ */
  const remove = async (req, res) => {
    let file;
    await transaction(db, async (c) => {
      file = (await fileModel.findForUpdate(c, id(req.params.id))).rows[0];
      if (!file) throw fail(404, 'ไม่พบไฟล์');
      const a = await appointment(c, req.user, file.appointment_id);
      if (!req.user.is_admin && (file.uploaded_by !== req.user.id || a.status === 'completed'))
        throw fail(403, 'ลบได้เฉพาะภาพที่ตนอัปโหลดก่อนตรวจเสร็จ');
      await fileModel.remove(c, file.id);
      await audit(c, req, 'file.delete', 'file', file.id);
    });
    if (path.basename(file.stored_name) === file.stored_name)
      await fs.unlink(path.join(uploadDir, file.stored_name)).catch(() => {});
    res.redirect('/app/appointments/' + file.appointment_id);
  };

  return { upload, show, remove };
};
