/* Controller log: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const { id, text, date } = require('../utils/validation');

module.exports = function createLogController(db) {
  /* ค้น Log ตามวันที่ไทย ผู้ใช้ และเหตุการณ์ แสดงล่าสุดไม่เกิน 300 รายการ */
  const list = async (req, res) => {
    const filters = {
      from: req.query.from ? date(req.query.from) : undefined,
      to: req.query.to ? date(req.query.to) : undefined,
      user_id: req.query.user_id ? id(req.query.user_id) : undefined,
      event: req.query.event ? text(req.query.event, 'เหตุการณ์', 100) : undefined
    };
    const logs = (await auditModel.search(db, filters)).rows;
    const users = (await userModel.listNames(db)).rows;
    const events = (await auditModel.listEvents(db)).rows;
    if (req.originalUrl.startsWith('/api/'))
      return res.json({
        logs
      });
    res.render('admin/logs', {
      title: 'บันทึกกิจกรรม',
      logs,
      users,
      events,
      filters: req.query
    });
  };

  return { list };
};
