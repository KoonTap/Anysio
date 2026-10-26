/* Controller appointment: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { has } = require('../utils/permissions');
const { fail, id, text, slot } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const { appointment, canVisit } = require('../services/clinicAccess');
const fileModel = require('../models/fileModel');
const appointmentModel = require('../models/appointmentModel');
const visitModel = require('../models/visitModel');
const userModel = require('../models/userModel');
const petModel = require('../models/petModel');

module.exports = function createAppointmentController(db) {
  /* แสดงรายการนัดและสัตว์ที่เลือกขอนัดได้ ตามขอบเขตสิทธิ์ผู้ใช้ */
  const list = async (req, res) => {
    const appointments = (await appointmentModel.listVisible(db, req.user)).rows;
    const pets = (await petModel.listForBooking(db, req.user)).rows;
    res.render('appointments', {
      title: 'นัดหมาย',
      appointments,
      pets
    });
  };

  /* สร้างนัดสถานะ pending หลังตรวจเจ้าของสัตว์และช่วงเวลา; ดัชนีฐานข้อมูลกันคิวซ้ำ */
  const create = async (req, res) => {
    const petId = id(req.body.pet_id);
    const p = (await petModel.findById(db, petId)).rows[0];
    if (!p) throw fail(404, 'ไม่พบสัตว์เลี้ยง');
    if (!req.user.is_admin && p.owner_id !== req.user.id)
      throw fail(403, 'ขอนัดได้เฉพาะสัตว์เลี้ยงของตน');
    let appointmentId;
    await transaction(db, async (c) => {
      const a = (
        await appointmentModel.create(
          c,
          petId,
          slot(req.body.scheduled_at),
          text(req.body.reason, 'อาการหรือเหตุผล', 1500)
        )
      ).rows[0];
      appointmentId = a.id;
      await audit(c, req, 'appointment.create', 'appointment', a.id);
    });
    res.redirect('/app/appointments/' + appointmentId);
  };

  /* หน้ารายละเอียด: ตรวจสิทธิ์เข้าถึงนัด และแยกสิทธิ์อ่านผลตรวจ/ภาพอีกครั้ง */
  const show = async (req, res) => {
    const a = await appointment(db, req.user, id(req.params.id));
    const visit = canVisit(req.user, a)
      ? (await visitModel.findByAppointment(db, a.id)).rows[0]
      : null;
    const files = has(req.user, 'file.read')
      ? (await fileModel.listByAppointment(db, a.id)).rows
      : [];

    /* ตัวเลือกผู้ตรวจต้องเปิดใช้งาน มี visit.create และไม่ใช่ Admin */
    const vets = has(req.user, 'appointment.confirm')
      ? (await userModel.listEligibleVets(db)).rows
      : [];
    res.render('appointment', {
      title: 'รายละเอียดนัด #' + a.id,
      a,
      visit,
      files,
      vets,
      canVisit: canVisit(req.user, a)
    });
  };

  /* เปลี่ยนสถานะนัดตาม action โดยตรวจ Permission ขอบเขตนัด และสถานะเดิม */
  const changeStatus = async (req, res) => {
    const action = req.body.action;
    const codes = {
      confirm: 'appointment.confirm',
      reject: 'appointment.reject',
      checkin: 'appointment.checkin',
      cancel: 'appointment.cancel.own'
    };
    if (!codes[action]) throw fail(400, 'การกระทำไม่ถูกต้อง');
    if (!has(req.user, codes[action])) throw fail(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะนี้');
    await transaction(db, async (c) => {
      await appointmentModel.lock(c, id(req.params.id));
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
      if (!allowed[action].includes(a.status))
        throw fail(409, 'สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้');
      let vetId = a.vet_id;
      let reason = '';

      /* ยืนยันนัดต้องเลือกผู้ตรวจที่มีสิทธิ์และนัดยังไม่เลยเวลา */
      if (action === 'confirm') {
        vetId = id(req.body.vet_id);
        const vet = (await userModel.findEligibleVet(c, vetId)).rows[0];
        if (!vet) throw fail(400, 'เลือกผู้ตรวจที่เปิดใช้งานและมีสิทธิ์บันทึกผลตรวจ');
        if (new Date(a.scheduled_at) <= new Date())
          throw fail(400, 'นัดนี้เลยเวลาแล้ว กรุณาสร้างนัดใหม่');
      }
      if (action === 'reject') reason = text(req.body.reject_reason, 'เหตุผลที่ปฏิเสธ', 1000);
      const status = {
        confirm: 'confirmed',
        reject: 'rejected',
        checkin: 'checked_in',
        cancel: 'cancelled'
      }[action];
      await appointmentModel.updateStatus(c, status, vetId, reason, a.id);
      await audit(c, req, 'appointment.' + action, 'appointment', a.id, 'success', {
        from: a.status,
        to: status
      });
    });
    res.redirect('/app/appointments/' + req.params.id);
  };

  return { list, create, show, changeStatus };
};
