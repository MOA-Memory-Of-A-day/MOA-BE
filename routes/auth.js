const express = require('express');
const router = express.Router();
const {googleVerify, googleSignUp, refresh, devLogin, logout} = require('../controllers/authController')
// 인가 미들웨어 추후 추가예정
// const authorization = require('../middlewares/authHandler');





router.post("/google/verify", googleVerify);
router.post("/google/signUp", googleSignUp);
router.post('/dev/login', devLogin)
router.post("/refresh", refresh);
router.post('/logout', logout)


module.exports = router;