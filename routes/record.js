const express = require('express');
const router = express.Router();
const multer = require('multer');
const { recordCreate, recordList, recordUpdate, recordDelete} = require('../controllers/recordController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }});

router.post('/create', upload.single('file'), recordCreate);
router.get('/list', recordList)
router.patch('/update', upload.single('file'), recordUpdate);
router.delete('/delete', recordDelete);

module.exports = router;