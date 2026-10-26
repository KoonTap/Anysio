/* Controller visit: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { has } = require('../utils/permissions');
const { fail, id, text, date } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const { appointment } = require('../services/clinicAccess');
const appointmentModel = require('../models/appointmentModel');
const visitModel = require('../models/visitModel');

module.exports = function createVisitController(db) {
  /* บันทึก/แก้ผลตรวจเฉพาะแพทย์ที่รับมอบหมายหรือ Admin; บันทึกพร้อมเปลี่ยนนัดเป็น completed */
  const save = async (req, res) => {
    await transaction(db, async (c) => {
      await appointmentModel.lock(c, id(req.params.id));
      const a = await appointment(c, req.user, id(req.params.id));
      if (!req.user.is_admin && a.vet_id !== req.user.id)
        throw fail(403, 'บันทึกผลได้เฉพาะนัดที่ได้รับมอบหมาย');
      const existing = (await visitModel.findIdByAppointment(c, a.id)).rows[0];
      if (!has(req.user, existing ? 'visit.update' : 'visit.create'))
        throw fail(403, 'ไม่มีสิทธิ์บันทึกผลตรวจ');
      if (existing ? a.status !== 'completed' : a.status !== 'checked_in')
        throw fail(409, 'ต้องเช็กอินก่อนบันทึกผลตรวจ');
      const values = [
        text(req.body.diagnosis, 'ผลวินิจฉัย', 3000),
        text(req.body.treatment, 'การรักษา', 3000),
        date(req.body.follow_up_date)
      ];
      if (existing) await visitModel.update(c, ...values, existing.id);
      else await visitModel.create(c, ...values, a.id, a.vet_id);
      await appointmentModel.complete(c, a.id);
      await audit(c, req, existing ? 'visit.update' : 'visit.create', 'appointment', a.id);
    });
    res.redirect('/app/appointments/' + req.params.id);
  };

  return { save };
};
