const express = require('express');
const router = express.Router();
const topicController = require('../controllers/topicController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, topicController.getTopics);
router.post('/extract', authenticate, topicController.extractTopics);

module.exports = router;
