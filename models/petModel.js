/* Model pet: รวม SQL แบบมีพารามิเตอร์ ไม่รับ req/res และไม่แสดงหน้าเว็บ */
const { has } = require('../utils/permissions');

/* ค้นข้อมูลตามรหัส (สัตว์เลี้ยง) */
function findById(db, petId) {
  return db.query('SELECT * FROM pets WHERE id=$1', [petId]);
}

/* อ่านสัตว์ที่ผู้ใช้เลือกขอนัดได้; Admin เห็นทุกตัว (สัตว์เลี้ยง) */
function listForBooking(db, user) {
  return db.query(
    `SELECT id,name FROM pets WHERE ${user.is_admin ? 'TRUE' : 'owner_id=$1'} ORDER BY name`,
    user.is_admin ? [] : [user.id]
  );
}

/* ลบข้อมูลตามรหัส โดยคงข้อจำกัด Foreign Key ของฐานข้อมูล (สัตว์เลี้ยง) */
function remove(db, petId) {
  return db.query('DELETE FROM pets WHERE id=$1', [petId]);
}

/* อ่านและล็อกแถวจนจบ Transaction เพื่อป้องกันการแก้พร้อมกัน (สัตว์เลี้ยง) */
function findForUpdate(db, petId) {
  return db.query('SELECT * FROM pets WHERE id=$1 FOR UPDATE', [petId]);
}

/* แก้ไขข้อมูลตามรหัส (สัตว์เลี้ยง) */
function update(db, name, species, breed, birthDate, note, petId) {
  return db.query('UPDATE pets SET name=$1,species=$2,breed=$3,birth_date=$4,note=$5 WHERE id=$6', [
    name,
    species,
    breed,
    birthDate,
    note,
    petId
  ]);
}

/* เพิ่มข้อมูลใหม่ (สัตว์เลี้ยง) */
function create(db, ownerId, name, species, breed, birthDate, note) {
  return db.query(
    'INSERT INTO pets(owner_id,name,species,breed,birth_date,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [ownerId, name, species, breed, birthDate, note]
  );
}

/* อ่านเฉพาะข้อมูลที่ผู้ใช้มีสิทธิ์เข้าถึง (สัตว์เลี้ยง) */
function listVisible(db, user) {
  const u = user;
  const all = has(u, 'pet.read.all');
  const clauses = [];
  if (has(u, 'pet.read.own')) clauses.push('p.owner_id=$1');
  if (has(u, 'pet.read.assigned'))
    clauses.push('EXISTS(SELECT 1 FROM appointments a WHERE a.pet_id=p.id AND a.vet_id=$1)');
  return db.query(
    `SELECT p.*,u.full_name AS owner_name FROM pets p JOIN users u ON u.id=p.owner_id WHERE ${all ? 'TRUE' : clauses.length ? '(' + clauses.join(' OR ') + ')' : 'FALSE'} ORDER BY p.id DESC`,
    all || !clauses.length ? [] : [u.id]
  );
}

module.exports = { findById, listForBooking, remove, findForUpdate, update, create, listVisible };
