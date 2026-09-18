const express = require('express');
const controller = require('../../../controllers/reconciliationController');
const { authenticate, reviewer } = require('../../../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/queue', reviewer, controller.queue);
router.get('/documents/:documentId', controller.list);
router.post('/documents/:documentId', controller.create);
router.get('/:id', controller.get);
router.post('/:id/decisions', reviewer, controller.decide);

module.exports = router;
