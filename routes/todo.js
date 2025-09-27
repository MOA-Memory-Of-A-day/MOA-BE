const express = require('express');
const router = express.Router();
// const authorization = require('../middlewares/authHandler');
const { todoCreate , todoList, todoUpdate, todoDelete} = require('../controllers/todoController')


router.post('/create', todoCreate);
router.get('/list', todoList);
router.patch('/update', todoUpdate);
router.delete('/delete', todoDelete);




module.exports = router;