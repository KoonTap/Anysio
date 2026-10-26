/* กฎตรวจสิทธิ์ที่ใช้ร่วมกัน; Admin ผ่านทุก Permission */
function has(user, code) {
  return Boolean(user && (user.is_admin || user.permissions.includes(code)));
}

function any(user, codes) {
  return codes.some((c) => has(user, c));
}

module.exports = { has, any };
