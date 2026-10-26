/* Controller pet: ตรวจข้อมูล ควบคุมขั้นตอน และส่งผลให้ View/JSON; SQL อยู่ใน Models */
const { fail, id, text, date } = require('../utils/validation');
const transaction = require('../db/transaction');
const audit = require('../services/auditLog');
const petModel = require('../models/petModel');

module.exports = function createPetController(db) {
  /* แสดงสัตว์ตามสิทธิ์: ทั้งหมด / ของตน / ที่มีนัดมอบหมายให้ตน */
  const list = async (req, res) => {
    const pets = (await petModel.listVisible(db, req.user)).rows;
    res.render('pets', {
      title: 'สัตว์เลี้ยง',
      pets
    });
  };

  /* เพิ่มสัตว์และ Log ใน Transaction เดียวกัน โดยใช้ผู้ที่ Login เป็นเจ้าของ */
  const create = async (req, res) => {
    const b = req.body;
    const species = text(b.species, 'ประเภท', 10);
    if (!['dog', 'cat', 'other'].includes(species)) throw fail(400, 'ประเภทสัตว์ไม่ถูกต้อง');
    const birth = date(b.birth_date);
    if (birth && new Date(birth) > new Date()) throw fail(400, 'วันเกิดต้องไม่อยู่ในอนาคต');
    await transaction(db, async (c) => {
      const pet = (
        await petModel.create(
          c,
          req.user.id,
          text(b.name, 'ชื่อสัตว์', 100),
          species,
          text(b.breed || '', 'สายพันธุ์', 100, false),
          birth,
          text(b.note || '', 'หมายเหตุ', 1000, false)
        )
      ).rows[0];
      await audit(c, req, 'pet.create', 'pet', pet.id);
    });
    res.redirect('/app/pets');
  };

  /* แก้สัตว์: ล็อกแถว ตรวจเจ้าของและข้อมูลก่อน UPDATE; Admin แก้ข้ามเจ้าของได้ */
  const update = async (req, res) => {
    await transaction(db, async (c) => {
      const pet = (await petModel.findForUpdate(c, id(req.params.id))).rows[0];
      if (!pet) throw fail(404, 'ไม่พบสัตว์เลี้ยง');
      if (!req.user.is_admin && pet.owner_id !== req.user.id)
        throw fail(403, 'แก้ไขได้เฉพาะสัตว์เลี้ยงของตน');
      const b = req.body;
      const species = text(b.species, 'ประเภท', 10);
      if (!['dog', 'cat', 'other'].includes(species)) throw fail(400, 'ประเภทไม่ถูกต้อง');
      const birth = date(b.birth_date);
      if (birth && new Date(birth) > new Date()) throw fail(400, 'วันเกิดไม่ถูกต้อง');
      await petModel.update(
        c,
        text(b.name, 'ชื่อสัตว์', 100),
        species,
        text(b.breed || '', 'สายพันธุ์', 100, false),
        birth,
        text(b.note || '', 'หมายเหตุ', 1000, false),
        pet.id
      );
      await audit(c, req, 'pet.update', 'pet', pet.id);
    });
    res.redirect('/app/pets');
  };

  /* ลบสัตว์ของตน; Foreign Key ในฐานข้อมูลจะกันการลบสัตว์ที่มีนัดอยู่ */
  const remove = async (req, res) => {
    await transaction(db, async (c) => {
      const pet = (await petModel.findForUpdate(c, id(req.params.id))).rows[0];
      if (!pet) throw fail(404, 'ไม่พบสัตว์เลี้ยง');
      if (!req.user.is_admin && pet.owner_id !== req.user.id)
        throw fail(403, 'ลบได้เฉพาะสัตว์เลี้ยงของตน');
      await petModel.remove(c, pet.id);
      await audit(c, req, 'pet.delete', 'pet', pet.id);
    });
    res.redirect('/app/pets');
  };

  return { list, create, update, remove };
};
