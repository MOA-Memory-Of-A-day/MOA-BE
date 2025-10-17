const express = require('express');
const router = express.Router();
const {googleVerify, googleSignUp, googleRefresh, devLogin, logout} = require('../controllers/authController')
// 인가 미들웨어 추후 추가예정
// const authorization = require('../middlewares/authHandler');





router.post("/google/verify", googleVerify);
router.post("/google/signUp", googleSignUp);
router.post("/google/refresh", googleRefresh);

router.post('/dev/login', devLogin)
router.post('/logout', logout)


module.exports = router;