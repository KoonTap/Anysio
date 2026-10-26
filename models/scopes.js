/* สร้างเงื่อนไข SQL ตามสิทธิ์ผู้ใช้; ใช้พารามิเตอร์แทนค่าผู้ใช้ */
const { has } = require('../utils/permissions');
function appointmentScope(user, alias = 'a', petAlias = 'p') {
  if (user.is_admin || has(user, 'appointment.read.all'))
    return {
      sql: 'TRUE',
      args: []
    };
  const conditions = [];
  if (has(user, 'appointment.read.own')) conditions.push(`${petAlias}.owner_id=$1`);
  if (has(user, 'appointment.read.assigned')) conditions.push(`${alias}.vet_id=$1`);
  return {
    sql: conditions.length ? `(${conditions.join(' OR ')})` : 'FALSE',
    args: conditions.length ? [user.id] : []
  };
}
module.exports = { appointmentScope };
