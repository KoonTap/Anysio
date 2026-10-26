// This catalog is the link between real routes and editable permission records.

/* รหัส Permission ต้องตรงกับที่ Route ตรวจ; ชื่อภาษาไทยใช้แสดงหน้าจอ */
const catalog = {
  'pet.read.own': 'ดูสัตว์เลี้ยงของตน',
  'pet.read.all': 'ดูสัตว์เลี้ยงทั้งหมด',
  'pet.read.assigned': 'ดูสัตว์ที่ได้รับมอบหมาย',
  'pet.create': 'เพิ่มสัตว์เลี้ยงของตน',
  'pet.update.own': 'แก้ไขสัตว์เลี้ยงของตน',
  'pet.delete.own': 'ลบสัตว์ที่ยังไม่มีนัดของตน',
  'appointment.create': 'ขอนัดหมาย',
  'appointment.read.own': 'ดูนัดของตน',
  'appointment.read.all': 'ดูนัดทั้งหมด',
  'appointment.read.assigned': 'ดูนัดที่ได้รับมอบหมาย',
  'appointment.confirm': 'ยืนยันนัดและมอบหมายแพทย์',
  'appointment.reject': 'ปฏิเสธนัด',
  'appointment.checkin': 'เช็กอิน',
  'appointment.cancel.own': 'ยกเลิกนัดของตน',
  'visit.create': 'บันทึกผลตรวจที่ได้รับมอบหมาย',
  'visit.update': 'แก้ผลตรวจที่ได้รับมอบหมาย',
  'visit.read.own': 'ดูผลตรวจสัตว์ของตน',
  'visit.read.assigned': 'ดูผลตรวจที่ได้รับมอบหมาย',
  'file.upload': 'แนบภาพในนัดที่เข้าถึงได้',
  'file.read': 'ดูภาพในนัดที่เข้าถึงได้',
  'file.delete': 'ลบภาพที่ตนอัปโหลดก่อนตรวจเสร็จ',
  'user.manage': 'จัดการผู้ใช้',
  'role.manage': 'จัดการบทบาท',
  'permission.manage': 'จัดการรายการสิทธิ์',
  'acl.manage': 'กำหนดสิทธิ์ให้บทบาท',
  'log.read': 'ดูบันทึกกิจกรรม'
};

/* สิทธิ์เริ่มต้นของแต่ละบทบาทสำหรับ seed; สิทธิ์ปัจจุบันจริงอ่านจากฐานข้อมูล */
const grants = {
  owner: ['pet.read.own', 'pet.create', 'pet.update.own', 'pet.delete.own', 'appointment.create',
    'appointment.read.own', 'appointment.cancel.own', 'visit.read.own', 'file.upload',
    'file.read', 'file.delete'
  ],
  receptionist: ['pet.read.all', 'appointment.read.all', 'appointment.confirm',
    'appointment.reject', 'appointment.checkin', 'file.read'
  ],
  vet: ['pet.read.assigned', 'appointment.read.assigned', 'visit.create', 'visit.update',
    'visit.read.assigned', 'file.upload', 'file.read', 'file.delete'
  ]
};

/* Admin ไม่อยู่ใน grants เพราะ utils/permissions.js ให้ผ่านการตรวจสิทธิ์อัตโนมัติ */
module.exports = {
  catalog,
  grants
};
