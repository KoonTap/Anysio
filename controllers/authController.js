/* Controller auth: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id, text } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const roleModel = require('../models/roleModel');

module.exports = function createAuthController(db) {
  /* เลือกหน้าแรกจากสถานะการเข้าสู่ระบบ */
  const home = (req, res) => res.redirect(req.user ? '/app' : '/login');
  // ตัวนับแยกต่อแอปและเริ่มใหม่เมื่อเซิร์ฟเวอร์รีสตาร์ต
  const attempts = new Map();
  const registrationAttempts = new Map();
  const dummy = bcrypt.hashSync('not-a-real-account-password', 12);

  /* เปิดหน้าสมัครสมาชิก; หากเข้าสู่ระบบอยู่แล้วให้กลับ Dashboard */
  const showRegister = (req, res) => {
    if (req.user) return res.redirect('/app');
    res.render('register', {
      title: 'สมัครสมาชิก',
      error: null,
      values: {}
    });
  };

  /* รับฟอร์มสมัคร: ตรวจข้อมูล จำกัดความถี่ และสร้างบัญชี Owner เท่านั้น */
  const register = async (req, res) => {
    if (req.user) return res.redirect('/app');

    /* เก็บเฉพาะชื่อไว้แสดงกลับเมื่อกรอกผิด ไม่ส่งรหัสผ่านกลับไปในฟอร์ม */
    const values = {
      username: typeof req.body.username === 'string' ? req.body.username.slice(0, 60) : '',
      full_name: typeof req.body.full_name === 'string' ? req.body.full_name.slice(0, 150) : ''
    };

    try {
      /* อนุญาตให้ส่งคำขอสมัครได้ไม่เกิน 10 ครั้งต่อ IP ในช่วง 15 นาที */
      const now = Date.now();
      const windowMs = 15 * 60 * 1000;
      for (const [ip, hit] of registrationAttempts) {
        if (now - hit.start >= windowMs) registrationAttempts.delete(ip);
      }
      const hit = registrationAttempts.get(req.ip) || {
        start: now,
        count: 0
      };
      if (hit.count >= 10) {
        res.set('Retry-After', String(Math.ceil((windowMs - (now - hit.start)) / 1000)));
        throw fail(429, 'สมัครสมาชิกหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองอีกครั้ง');
      }
      hit.count++;
      registrationAttempts.set(req.ip, hit);

      /* ตรวจชื่อผู้ใช้ รหัสผ่าน ความยาวเป็นไบต์ และช่องยืนยันรหัสผ่าน */
      const username = text(req.body.username, 'ชื่อผู้ใช้', 60);
      const fullName = text(req.body.full_name, 'ชื่อที่แสดง', 150);
      if (!/^[a-zA-Z0-9_.-]{3,60}$/.test(username)) {
        throw fail(400, 'ชื่อผู้ใช้ต้องมี 3–60 ตัว ใช้ภาษาอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง');
      }
      const password = req.body.password;
      if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
        throw fail(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษรและไม่เกิน 72 ไบต์');
      }
      if (password !== password.trim()) {
        throw fail(400, 'รหัสผ่านต้องไม่มีช่องว่างที่ต้นหรือท้าย');
      }
      if (password !== req.body.confirm_password) {
        throw fail(400, 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      }

      /* แฮชรหัสผ่านก่อนบันทึก; สร้างบัญชีกับ Log ภายใน Transaction เดียวกัน */
      const hash = await bcrypt.hash(password, 12);
      await transaction(db, async (client) => {
        // Public registration always uses the owner role, never a submitted role ID.
        const role = (await roleModel.findOwnerForRegistration(client)).rows[0];
        if (!role) throw fail(503, 'ยังไม่สามารถสมัครสมาชิกได้ กรุณาติดต่อเจ้าหน้าที่คลินิก');

        const account = (await userModel.create(client, username, hash, fullName, role.id)).rows[0];
        req.attemptedUsername = username;
        await audit(client, req, 'user.register', 'user', account.id);
      });

      /* ส่งสถานะสมัครสำเร็จให้หน้า Login แสดงข้อความเพียงครั้งเดียว */
      req.session.registrationComplete = true;
      res.redirect('/login');
    } catch (error) {
      const duplicate = error.code === '23505';
      if (!duplicate && ![400, 429, 503].includes(error.status)) throw error;
      res.status(duplicate ? 409 : error.status).render('register', {
        title: 'สมัครสมาชิก',
        error: duplicate ? 'ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่อใหม่' : error.message,
        values
      });
    }
  };

  /* แสดงหน้า Login พร้อมอ่านข้อความสมัครสำเร็จแล้วล้างสถานะข้อความ */
  const showLogin = (req, res) => {
    if (req.user) return res.redirect('/app');
    const registered = req.session.registrationComplete === true;
    delete req.session.registrationComplete;
    res.render('login', {
      title: 'เข้าสู่ระบบ',
      registered
    });
  };

  /* รับข้อมูลเข้าสู่ระบบและจำกัดความพยายามที่ไม่ผ่าน 20 ครั้งต่อ IP ในช่วง 10 นาที */
  const login = async (req, res) => {
    const key = req.ip;
    const now = Date.now();
    for (const [k, v] of attempts) if (now - v.start > 600000) attempts.delete(k);
    const hit = attempts.get(key) || {
      start: now,
      count: 0
    };
    if (hit.count >= 20) {
      throw fail(429, 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 10 นาที');
    }

    /* นับคำขอที่กรอกไม่ครบด้วย; auditErrors บันทึกความล้มเหลวเพียงครั้งเดียว */
    hit.count++;
    attempts.set(key, hit);
    const username = text(req.body.username, 'ชื่อผู้ใช้', 80);
    req.attemptedUsername = username;
    const password = text(req.body.password, 'รหัสผ่าน', 200);
    const user = (await userModel.findByUsername(db, username)).rows[0];

    /* เทียบรหัสกับ Hash; ใช้ Hash จำลองเมื่อไม่พบบัญชีเพื่อลดความต่างของเวลาประมวลผล */
    const valid = await bcrypt.compare(password, user?.password_hash || dummy);
    if (!user || !valid || !user.is_active) {
      throw fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน');
    }
    attempts.delete(key);

    /* เปลี่ยน Session ID หลัง Login สำเร็จ แล้วเก็บ userId และบันทึก Log */
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve()))
    );
    req.session.userId = user.id;
    req.user = user;
    await audit(db, req, 'login', 'auth', user.id);
    await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
    res.redirect('/app');
  };

  /* บันทึกการออกจากระบบ ทำลาย Session และลบ Cookie ก่อนกลับหน้า Login */
  const logout = async (req, res) => {
    if (req.user) await audit(db, req, 'logout', 'auth', req.user.id);
    await new Promise((resolve, reject) => req.session.destroy((e) => (e ? reject(e) : resolve())));
    res.clearCookie('anysio.sid', {
      path: '/'
    });
    res.redirect('/login');
  };

  return { home, showRegister, register, showLogin, login, logout };
};
