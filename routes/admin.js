/* Routes admin: กำหนด URL, Middleware และ Controller ที่รับงานเท่านั้น */
const express = require('express');
const { permission } = require('../middleware/auth');

module.exports = function (db) {
  const route = express.Router();
  const admin = require('../controllers/adminController')(db);
  const user = require('../controllers/userController')(db);
  const role = require('../controllers/roleController')(db);
  const permissions = require('../controllers/permissionController')(db);
  const acl = require('../controllers/aclController')(db);
  const log = require('../controllers/logController')(db);

  route.use(permission('user.manage', 'role.manage', 'permission.manage', 'acl.manage', 'log.read'));
  route.get('/', admin.index);
  route.get('/users', permission('user.manage'), user.list);
  route.post('/users/:id/edit', permission('user.manage'), user.update);
  route.post('/users/:id/delete', permission('user.manage'), user.remove);
  route.get('/roles', permission('role.manage'), role.list);
  route.post('/roles', permission('role.manage'), role.create);
  route.post('/roles/:id/edit', permission('role.manage'), role.update);
  route.post('/roles/:id/delete', permission('role.manage'), role.remove);
  route.get('/permissions', permission('permission.manage'), permissions.list);
  route.post('/permissions', permission('permission.manage'), permissions.create);
  route.post('/permissions/:id/edit', permission('permission.manage'), permissions.update);
  route.post('/permissions/:id/delete', permission('permission.manage'), permissions.remove);
  route.get('/acl', permission('acl.manage'), acl.show);
  route.post('/acl', permission('acl.manage'), acl.update);
  route.get('/logs', permission('log.read'), log.list);
  return route;
};
