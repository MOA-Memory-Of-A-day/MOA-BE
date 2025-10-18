const express = require('express');
const router = express.Router();
const multer = require('multer');
const { recordCreate,recordAudio, recordList, recordUpdate, recordDelete} = require('../controllers/recordController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }});

router.post('/create', upload.single('image'), recordCreate);
router.post('/audio', upload.single('audio'), recordAudio)
router.get('/list', recordList)
router.patch('/update', upload.single('image'), recordUpdate);
router.delete('/delete', recordDelete);

module.exports = router;