const express = require('express');
const router = express.Router();
const topicController = require('../../../controllers/topicController');
const { authenticate, authorize } = require('../../../middleware/auth');

// REST v1 Topics Endpoints
router.get('/', authenticate, topicController.getTopics);
router.post('/analyze', authenticate, topicController.analyzeTopics);
router.get('/trends', authenticate, authorize('admin'), topicController.getTopicTrends);
router.get('/clusters', authenticate, authorize('admin'), topicController.getTopicClusters);
router.get('/entities', authenticate, authorize('admin'), topicController.getTopicEntities);
router.get('/emerging', authenticate, authorize('admin'), topicController.getEmergingTopics);
router.get('/changes', authenticate, authorize('admin'), topicController.getTopicChanges);

// Legacy stub alias
router.post('/extract', authenticate, topicController.extractTopics);

module.exports = router;
