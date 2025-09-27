const express = require('express');
const router = require('express').Router();
const { recordCreate, recordList, recordUpdate, recordDelete} = require('../controllers/recordController');


router.post('/create', recordCreate);
router.get('/list', recordList)
router.patch('/update', recordUpdate);
router.delete('/delete', recordDelete);

module.exports = router;