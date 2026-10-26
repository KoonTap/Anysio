/* Middleware ปลายทาง: 404 และแปลงข้อผิดพลาดเป็น HTML/JSON */
const notFound = (req, res, next) => {
  const e = new Error('ไม่พบหน้าที่ต้องการ');
  e.status = 404;
  next(e);
};

const errorHandler = async (err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = err.status || 500;
  let message = err.message;
  if (err.code === '23505') {
    status = 409;
    message = 'ข้อมูลซ้ำ หรือช่วงเวลานี้มีนัดแล้ว กรุณาเลือกข้อมูลใหม่';
  }
  // PostgreSQL อาจส่ง 23001 เมื่อ ON DELETE RESTRICT ปฏิเสธการลบข้อมูลที่ใช้งานอยู่
  if (['23503', '23001'].includes(err.code)) {
    status = 409;
    message = 'รายการนี้มีข้อมูลใช้งานอยู่ จึงลบหรือเปลี่ยนแปลงไม่ได้';
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    message = 'ไฟล์ต้องมีขนาดไม่เกิน 5 MB';
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message = 'อัปโหลดได้ครั้งละหนึ่งภาพ';
  }
  if (status === 500) {
    message = 'ระบบขัดข้อง กรุณาลองใหม่';
    console.error('Request error:', err.code || err.name);
  }

  res.status(status);
  if (req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json')
    return res.json({
      error: message,
      status
    });
  res.render('error', {
    title: `ข้อผิดพลาด ${status}`,
    status,
    message
  });
};
module.exports = { notFound, errorHandler };
