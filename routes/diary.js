// routes/diary.js
const express = require('express');
const router = express.Router();
const { createDiary, getDiary, listDiaries, updateDiary } = require('../controllers/diaryController');

router.post('/create', createDiary); // body: { recordIds: [...], persona: 0|1|2|3 }
router.get('/list', listDiaries);
router.get('/:id', getDiary);
router.patch('/update', updateDiary);
// router.delete('/delete', deleteDiary);

module.exports = router;