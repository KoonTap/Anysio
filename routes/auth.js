/* Routes auth: กำหนด URL, Middleware และ Controller ที่รับงานเท่านั้น */
const express = require('express');

module.exports = function (db) {
  const route = express.Router();
  const auth = require('../controllers/authController')(db);

  route.get('/', auth.home);
  route.get('/register', auth.showRegister);
  route.post('/register', auth.register);
  route.get('/login', auth.showLogin);
  route.post('/login', auth.login);
  route.post('/logout', auth.logout);
  return route;
};
