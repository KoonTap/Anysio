/* Model acl: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */

/* ถอนสิทธิ์จากบทบาท (การผูกสิทธิ์) */
function revoke(db, roleId, permissionId) {
  return db.query('DELETE FROM role_permissions WHERE role_id=$1 AND permission_id=$2', [
    roleId,
    permissionId
  ]);
}

/* ให้สิทธิ์กับบทบาท โดยไม่เพิ่มคู่เดิมซ้ำ (การผูกสิทธิ์) */
function grant(db, roleId, permissionId) {
  return db.query('INSERT INTO role_permissions VALUES($1,$2) ON CONFLICT DO NOTHING', [
    roleId,
    permissionId
  ]);
}

/* อ่านรายการทั้งหมด (การผูกสิทธิ์) */
function list(db) {
  return db.query('SELECT * FROM role_permissions');
}

/* อ่านสิทธิ์ล่าสุดของบทบาทเพื่อใช้ทุกคำขอ (การผูกสิทธิ์) */
function listRolePermissions(db, roleId) {
  return db.query(
    'SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=$1',
    [roleId]
  );
}

module.exports = { revoke, grant, list, listRolePermissions };
