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
const {
  has,
  any,
  auditErrors,
  csrf
} = require('./middleware/security');

/* สร้างแอป โดยรับฐานข้อมูลและที่เก็บ Session แบบกำหนดเองได้สำหรับการทดสอบ */
function createApp({
  db,
  sessionStore,
  sessionSecret,
  uploadDir
} = {}) {
  db = db || require('./db/pool');
  const app = express();
  uploadDir = uploadDir || path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, {
    recursive: true
  });
  const secret = sessionSecret || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error(
    'SESSION_SECRET must contain at least 32 characters.');
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  /* ตั้ง Header ความปลอดภัย และเปิดเฉพาะ public ให้โหลดผ่าน /static */
  app.use(helmet());
  app.use('/static', express.static(path.join(__dirname, 'public')));

  /* อ่านฟอร์มและ JSON ลง req.body พร้อมจำกัดขนาดคำขอ */
  app.use(express.urlencoded({
    extended: false,
    limit: '32kb'
  }));
  app.use(express.json({
    limit: '32kb'
  }));

  /* จำการเข้าสู่ระบบด้วย Cookie; ข้อมูล Session จริงเก็บใน PostgreSQL อายุ 8 ชั่วโมง */
  app.use(session({
    name: 'anysio.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore || new PgStore({
      pool: db,
      createTableIfMissing: false
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000
    }
  }));

  /* อ่านบัญชีและสิทธิ์ล่าสุดทุกคำขอ เพื่อให้เปลี่ยน ACL ได้โดยไม่ต้อง Login ใหม่ */
  app.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.session.userId) {
      const u = (await db.query(
        'SELECT u.id,u.username,u.full_name,u.role_id,u.is_active,r.name AS role_name,r.is_admin FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1',
        [req.session.userId])).rows[0];
      if (u?.is_active) {
        u.permissions = (await db.query(
          'SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=$1',
          [u.role_id])).rows.map(x => x.code);
        req.user = u;
      }
    }

    /* ส่งตัวแปรและฟังก์ชันให้ EJS ใช้แสดงเมนู ชื่อผู้ใช้ วันที่ และสถานะ */
    res.locals.user = req.user || null;
    res.locals.has = (code) => has(req.user, code);
    res.locals.any = (codes) => any(req.user, codes);
    res.locals.adminMenu = ['user.manage', 'role.manage', 'permission.manage', 'acl.manage',
      'log.read'
    ];
    res.locals.currentPath = req.path;
    res.locals.formatDate = (d) => d ? new Date(d).toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium',
      timeStyle: 'short'
    }) : '—';
    res.locals.dateValue = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    res.locals.statusNames = {
      pending: 'รอยืนยัน',
      confirmed: 'ยืนยันแล้ว',
      rejected: 'ปฏิเสธ',
      cancelled: 'ยกเลิก',
      checked_in: 'เช็กอินแล้ว',
      completed: 'ตรวจเสร็จ'
    };

    /* ฟอร์มภาพต้องให้ Multer อ่านข้อมูลก่อน จึงตรวจ CSRF ภายใน Route อัปโหลด */
    if (req.is('multipart/form-data')) {
      // Multipart CSRF is checked after the bounded, in-memory parser in the upload route.
      if (!req.session.csrf) req.session.csrf = require('node:crypto').randomBytes(32)
        .toString('hex');
      res.locals.csrf = req.session.csrf;
      return next();
    }
    csrf(req, res, next);
  });

  /* เชื่อม URL กับส่วนทำงาน: บัญชีผู้ใช้ งานคลินิก และ Admin (หน้าเว็บกับ API ใช้ Router เดียวกัน) */
  app.get('/', (req, res) => res.redirect(req.user ? '/app' : '/login'));
  require('./controllers/authController')(app, db);
  app.use('/app', require('./routes/clinic')(db, uploadDir));
  const admin = require('./routes/admin')(db);
  app.use('/admin', admin);
  app.use('/api/admin', admin);

  /* เมื่อไม่พบ Route ที่ตรงกับ URL ให้ส่งข้อผิดพลาด 404 */
  app.use((req, res, next) => {
    const e = new Error('ไม่พบหน้าที่ต้องการ');
    e.status = 404;
    next(e);
  });

  /* บันทึกข้อผิดพลาดด้วย Middleware ก่อนส่งต่อให้ส่วนแสดงข้อความ */
  app.use(auditErrors(db));

  /* จัดการข้อผิดพลาดส่วนกลาง: แปลงข้อผิดพลาดฐานข้อมูล/ไฟล์เป็นข้อความที่อ่านเข้าใจ */
  app.use(async (err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || 500;
    let message = err.message;
    if (err.code === '23505') {
      status = 409;
      message = 'ข้อมูลซ้ำ หรือช่วงเวลานี้มีนัดแล้ว กรุณาเลือกข้อมูลใหม่';
    }
    if (err.code === '23503') {
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
  });
  return app;
}

/* เปิดพอร์ตเมื่อรันไฟล์นี้โดยตรง; การ require จะคืน createApp โดยไม่เปิดเซิร์ฟเวอร์ */
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '127.0.0.1', () => console.log(`anysio: http://127.0.0.1:${port}`));
}
module.exports = createApp;
