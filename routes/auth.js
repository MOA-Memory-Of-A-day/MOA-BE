const express = require('express');
const router = express.Router();
// const authorization = require('../middlewares/authHandler');
const {getUser, register, googleLogin, logout} = require('../controllers/authController')




// router.get('/user/detail',authorization, getUser)
// router.post('/register',register);

// router.post('/login', login);
// router.post('/logout', logout)

router.post("/google/login", googleLogin);



module.exports = router;