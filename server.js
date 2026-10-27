/* โหลดค่า .env แล้วประกอบ Express, Session, Middleware และ Route */
require('dotenv').config({
  quiet: true
});
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const helmet = require('helmet');
const auditErrors = require('./middleware/audit');
const { notFound, errorHandler } = require('./middleware/errors');

/* สร้างแอป โดยรับฐานข้อมูลและที่เก็บ Session แบบกำหนดเองได้ */
function createApp({ db, sessionStore, sessionSecret, uploadDir } = {}) {
  db = db || require('./db/pool');
  const app = express();
  uploadDir = uploadDir || path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, {
    recursive: true
  });
  const secret = sessionSecret || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  /* ตั้ง Header ความปลอดภัย และเปิดเฉพาะ public ให้โหลดผ่าน /static */
  app.use(helmet());
  app.use('/static', express.static(path.join(__dirname, 'public')));

  /* อ่านฟอร์มและ JSON ลง req.body พร้อมจำกัดขนาดคำขอ */
  app.use(
    express.urlencoded({
      extended: false,
      limit: '32kb'
    })
  );
  app.use(
    express.json({
      limit: '32kb'
    })
  );

  /* จำการเข้าสู่ระบบด้วย Cookie; ข้อมูล Session จริงเก็บใน PostgreSQL อายุ 8 ชั่วโมง */
  app.use(
    session({
      name: 'anysio.sid',
      secret,
      resave: false,
      saveUninitialized: false,
      store:
        sessionStore ||
        new PgStore({
          pool: db,
          createTableIfMissing: false
        }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000
      }
    })
  );

  /* อ่านบัญชีและสิทธิ์ล่าสุดทุกคำขอ เพื่อให้เปลี่ยน ACL ได้โดยไม่ต้อง Login ใหม่ */
  app.use(require('./middleware/context')(db));

  /* เชื่อม URL กับส่วนทำงาน: บัญชีผู้ใช้ งานคลินิก และ Admin (หน้าเว็บกับ API ใช้ Router เดียวกัน) */
  app.use(require('./routes/auth')(db));
  app.use('/app', require('./routes/clinic')(db, uploadDir));
  const admin = require('./routes/admin')(db);
  app.use('/admin', admin);
  app.use('/api/admin', admin);

  /* เมื่อไม่พบ Route ที่ตรงกับ URL ให้ส่งข้อผิดพลาด 404 */
  app.use(notFound);

  /* บันทึกข้อผิดพลาดด้วย Middleware ก่อนส่งต่อให้ส่วนแสดงข้อความ */
  app.use(auditErrors(db));

  /* จัดการข้อผิดพลาดส่วนกลาง: แปลงข้อผิดพลาดฐานข้อมูล/ไฟล์เป็นข้อความที่อ่านเข้าใจ */
  app.use(errorHandler);
  return app;
}

/* เปิดพอร์ตเมื่อรันไฟล์นี้โดยตรง; การ require จะคืน createApp โดยไม่เปิดเซิร์ฟเวอร์ */
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '127.0.0.1', () => console.log(`anysio: http://127.0.0.1:${port}`));
}
module.exports = createApp;
