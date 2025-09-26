const express = require('express');
const router = express.Router();
// const authorization = require('../middlewares/authHandler');
const {googleVerify, googleSignUp, googleRefresh, logout} = require('../controllers/authController')




// router.get('/user/detail',authorization, getUser)
// router.post('/register',register);

// router.post('/login', login);
router.post('/logout', logout)

router.post("/google/verify", googleVerify);
router.post("/google/signUp", googleSignUp);
router.post("/google/refresh", googleRefresh);



module.exports = router;