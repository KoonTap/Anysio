/* Routes clinic: กำหนด URL, Middleware และ Controller ที่รับงานเท่านั้น */
const express = require('express');
const { login, permission } = require('../middleware/auth');
const csrf = require('../middleware/csrf');
const { authorizeUpload, upload } = require('../middleware/upload');

module.exports = function (db, uploadDir) {
  const route = express.Router();
  const dashboard = require('../controllers/dashboardController')(db);
  const pet = require('../controllers/petController')(db);
  const appointment = require('../controllers/appointmentController')(db);
  const visit = require('../controllers/visitController')(db);
  const file = require('../controllers/fileController')(db, uploadDir);

  route.use(login);
  route.get('/', dashboard.show);
  route.get('/pets', permission('pet.read.own', 'pet.read.all', 'pet.read.assigned'), pet.list);
  route.post('/pets', permission('pet.create'), pet.create);
  route.post('/pets/:id/edit', permission('pet.update.own'), pet.update);
  route.post('/pets/:id/delete', permission('pet.delete.own'), pet.remove);
  route.get(
    '/appointments',
    permission('appointment.read.own', 'appointment.read.all', 'appointment.read.assigned'),
    appointment.list
  );
  route.post('/appointments', permission('appointment.create'), appointment.create);
  route.get(
    '/appointments/:id',
    permission('appointment.read.own', 'appointment.read.all', 'appointment.read.assigned'),
    appointment.show
  );
  route.post('/appointments/:id/status', appointment.changeStatus);
  route.post('/appointments/:id/visit', visit.save);
  route.post(
    '/appointments/:id/files',
    permission('file.upload'),
    authorizeUpload(db),
    upload.single('image'),
    csrf,
    file.upload
  );
  route.get('/files/:id', permission('file.read'), file.show);
  route.post('/files/:id/delete', permission('file.delete'), file.remove);
  return route;
};
