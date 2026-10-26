/* Controller dashboard: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const appointmentModel = require('../models/appointmentModel');

module.exports = function createDashboardController(db) {
  /* Dashboard: อ่านนัดเฉพาะที่ผู้ใช้มีสิทธิ์ แล้วส่งให้ EJS สรุปสถานะ */
  const show = async (req, res) => {
    const rows = (await appointmentModel.listVisible(db, req.user)).rows;
    res.render('dashboard', {
      title: 'ภาพรวมคลินิก',
      appointments: rows
    });
  };

  return { show };
};
