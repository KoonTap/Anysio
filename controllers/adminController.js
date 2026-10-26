/* Controller admin: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */

module.exports = function createAdminController(db) {
  /* เลือกหน้าแรกของส่วนจัดการตามสิทธิ์ที่บัญชีมี */
  const index = (req, res) => {
    const pages = {
      'user.manage': 'users',
      'role.manage': 'roles',
      'permission.manage': 'permissions',
      'acl.manage': 'acl',
      'log.read': 'logs'
    };
    const first = Object.keys(pages).find(
      (code) => req.user.is_admin || req.user.permissions.includes(code)
    );
    res.redirect('/admin/' + pages[first]);
  };

  return { index };
};
