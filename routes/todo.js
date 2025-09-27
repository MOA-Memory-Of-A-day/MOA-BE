const express = require('express');
const router = express.Router();
const { todoCreate , todoList, todoUpdate, todoDelete} = require('../controllers/todoController')
// const authorization = require('../middlewares/authHandler');

router.post('/create', todoCreate);
router.get('/list', todoList);
router.patch('/update', todoUpdate);
router.delete('/delete', todoDelete);




module.exports = router;