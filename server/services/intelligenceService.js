const Document = require('../models/Document');
const Topic = require('../models/Topic');
const ExtractedRecord = require('../models/ExtractedRecord');
const DocumentChunk = require('../models/DocumentChunk');
const llmService = require('./llmService');
const ragService = require('./ragService');
const { discoverTextTopics } = require('./topicDiscovery');
const { documentScope } = require('../utils/documentScope');
const { discoverTextEntities } = require('./entityDiscovery');

function rebuildTopicTrends(topic) {
  const trends = new Map();
  for (const contribution of topic.contributions) {
    for (const period of new Set(contribution.periods)) {
      const trend = trends.get(period) || { period, count: 0, weightSum: 0 };
      trend.count++;
      trend.weightSum += contribution.weight;
      trends.set(period, trend);
    }
  }
  topic.trendData = [...trends.values()].sort((first, second) => first.period.localeCompare(second.period))
    .map(trend => ({ period: trend.period, count: trend.count, avgWeight: trend.weightSum / trend.count }));
  topic.weight = topic.contributions.length
    ? topic.contributions.reduce((sum, item) => sum + item.weight, 0) / topic.contributions.length : 0;
  topic.keywords = [...new Set(topic.contributions.flatMap(item => item.keywords))];
}

// =============================================
// 1. NAMED ENTITY RECOGNITION
// =============================================
exports.extractEntities = async (documentId) => {
  const document = await Document.findById(documentId);
  if (!document || !document.extractedText) return [];

  const text = document.extractedText;

  const systemPrompt = `You are a Named Entity Recognition (NER) engine for mining industry documents.
Extract all named entities from the provided text.

Return ONLY valid JSON:
{
  "entities": [
    { "name": "Jayant Mine", "type": "Mine", "mentions": 3 },
    { "name": "NCL", "type": "Subsidiary", "mentions": 5 }
  ]
}

Entity types MUST be one of: Mine, Subsidiary, Location, Equipment, Project, Person, Organization, Other.
Count how many times each entity appears approximately. Do not invent entities.`;

  try {
    const cleaned = await discoverTextEntities(text, llmService.callLLM, systemPrompt);

    document.entities = cleaned;
    await document.save();
    return cleaned;
  } catch (err) {
    console.warn('Entity extraction failed:', err.message);
    throw err;
  }
};

// =============================================
// 2. TOPIC DISCOVERY & CLUSTERING
// =============================================
exports.discoverTopics = async (documentId) => {
  const document = await Document.findById(documentId);
  if (!document || !document.extractedText) return [];

  const text = document.extractedText;

  // Extract period info from records for trend tracking
  const records = await ExtractedRecord.find({ documentId }).lean();
  const periods = [...new Set(records.map(r => r.period).filter(Boolean))];

  const systemPrompt = `You are a Topic Discovery engine for mining documents.
Identify the main topics/themes in this text.

Return ONLY valid JSON:
{
  "topics": [
    { "name": "Coal Production", "keywords": ["production", "output", "coal", "MT"], "weight": 0.9 },
    { "name": "Safety Compliance", "keywords": ["safety", "incident", "compliance"], "weight": 0.7 }
  ]
}

Rules:
- Return 3-8 topics maximum.
- Each topic needs a clear, concise name.
- weight is 0-1 indicating how dominant the topic is.
- keywords should be 3-6 relevant terms.`;

  try {
    const topicsData = await discoverTextTopics(text, llmService.callLLM, systemPrompt);

    const createdTopicIds = [];

    for (const td of topicsData) {
      if (!td.name) continue;

      let topic = await Topic.findOne({ name: { $regex: new RegExp(`^${td.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });

      if (!topic) {
        topic = new Topic({
          name: td.name,
          keywords: td.keywords || [],
          documents: [documentId],
          weight: td.weight
        });
      } else {
        if (!topic.documents.includes(documentId)) {
          topic.documents.push(documentId);
        }
        topic.keywords = [...new Set([...topic.keywords, ...(td.keywords || [])])];
      }

      topic.contributions = (topic.contributions || []).filter(item => String(item.documentId) !== String(documentId));
      topic.contributions.push({ documentId, periods, weight: td.weight, keywords: td.keywords });
      rebuildTopicTrends(topic);

      await topic.save();
      createdTopicIds.push(topic._id);
    }

    const staleTopics = await Topic.find({ documents: documentId, _id: { $nin: createdTopicIds } });
    for (const topic of staleTopics) {
      topic.documents = topic.documents.filter(identifier => String(identifier) !== String(documentId));
      topic.contributions = (topic.contributions || []).filter(item => String(item.documentId) !== String(documentId));
      rebuildTopicTrends(topic);
      await topic.save();
    }

    // Compute related topics (co-occurrence: topics that share documents)
    for (const topicId of createdTopicIds) {
      const thisTopic = await Topic.findById(topicId);
      if (!thisTopic) continue;

      const coOccurring = await Topic.find({
        _id: { $ne: topicId },
        documents: { $in: thisTopic.documents }
      }).lean();

      thisTopic.relatedTopics = coOccurring.map(co => ({
        topicId: co._id,
        strength: co.documents.filter(d => thisTopic.documents.map(String).includes(String(d))).length / Math.max(thisTopic.documents.length, 1)
      })).slice(0, 5);

      await thisTopic.save();
    }

    // Save topic references on the document
    document.topicIds = createdTopicIds;
    await document.save();

    return createdTopicIds;
  } catch (err) {
    console.warn('Topic discovery failed:', err.message);
    throw err;
  }
};

// =============================================
// 3. DOCUMENT SIMILARITY (Deterministic)
// =============================================
exports.computeDocumentSimilarity = async (documentId, user) => {
  const accessible = await Document.find(user ? documentScope(user) : {}).select('_id').lean();
  const accessibleIds = accessible.map(document => document._id);
  if (!accessibleIds.some(identifier => String(identifier) === String(documentId))) return [];
  // Get all chunks for target document
  const targetChunks = await DocumentChunk.find({
    documentId,
    embedding: { $exists: true, $ne: [] }
  }).lean();

  if (targetChunks.length === 0) return [];

  // Compute average embedding for target document
  const embLen = targetChunks[0].embedding.length;
  const avgEmbedding = new Array(embLen).fill(0);

  for (const chunk of targetChunks) {
    for (let i = 0; i < embLen; i++) {
      avgEmbedding[i] += chunk.embedding[i];
    }
  }
  for (let i = 0; i < embLen; i++) {
    avgEmbedding[i] /= targetChunks.length;
  }

  // Get all other documents' chunks
  const otherChunks = await DocumentChunk.find({
    documentId: { $ne: documentId, $in: accessibleIds },
    embedding: { $exists: true, $ne: [] }
  }).populate('documentId', 'originalName filename').lean();

  // Group by document and compute avg embedding
  const docEmbeddings = {};
  for (const chunk of otherChunks) {
    if (!chunk.documentId) continue;
    const did = String(chunk.documentId._id || chunk.documentId);
    if (!docEmbeddings[did]) {
      docEmbeddings[did] = {
        doc: chunk.documentId,
        embeddings: [],
      };
    }
    docEmbeddings[did].embeddings.push(chunk.embedding);
  }

  // Cosine similarity helper
  const cosine = (a, b) => {
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      nA += a[i] * a[i];
      nB += b[i] * b[i];
    }
    if (nA === 0 || nB === 0) return 0;
    return dot / (Math.sqrt(nA) * Math.sqrt(nB));
  };

  const similarities = [];
  for (const [did, data] of Object.entries(docEmbeddings)) {
    const otherAvg = new Array(embLen).fill(0);
    for (const emb of data.embeddings) {
      for (let i = 0; i < embLen; i++) otherAvg[i] += emb[i];
    }
    for (let i = 0; i < embLen; i++) otherAvg[i] /= data.embeddings.length;

    const score = cosine(avgEmbedding, otherAvg);
    similarities.push({
      documentId: did,
      doc: data.doc,
      score: Math.round(score * 1000) / 1000
    });
  }

  similarities.sort((a, b) => b.score - a.score);
  const top5 = similarities.slice(0, 5);

  // Save to document
  const document = await Document.findById(documentId);
  if (document) {
    document.similarDocuments = top5.map(s => ({
      documentId: s.documentId,
      score: s.score
    }));
    await document.save();
  }

  return top5;
};

// =============================================
// 4. CHANGE DETECTION (Fully Deterministic)
// =============================================
exports.detectChanges = async (docIdA, docIdB) => {
  const [recordsA, recordsB] = await Promise.all([
    ExtractedRecord.find({ documentId: docIdA }).lean(),
    ExtractedRecord.find({ documentId: docIdB }).lean()
  ]);

  const [docA, docB] = await Promise.all([
    Document.findById(docIdA, 'originalName').lean(),
    Document.findById(docIdB, 'originalName').lean()
  ]);

  const keyFn = (r) => `${(r.parameter || '').toLowerCase()}|${(r.mineName || '').toLowerCase()}|${(r.subsidiary || '').toLowerCase()}`;

  const mapA = {};
  for (const r of recordsA) {
    const k = keyFn(r);
    if (!mapA[k]) mapA[k] = [];
    mapA[k].push(r);
  }

  const mapB = {};
  for (const r of recordsB) {
    const k = keyFn(r);
    if (!mapB[k]) mapB[k] = [];
    mapB[k].push(r);
  }

  const allKeys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
  const changes = [];

  for (const key of allKeys) {
    const inA = mapA[key];
    const inB = mapB[key];

    if (inA && !inB) {
      changes.push({
        type: 'removed',
        parameter: inA[0].parameter,
        mineName: inA[0].mineName,
        subsidiary: inA[0].subsidiary,
        oldValue: inA.map(r => `${r.value} ${r.unit || ''} (${r.period || ''})`).join('; '),
        newValue: null
      });
    } else if (!inA && inB) {
      changes.push({
        type: 'added',
        parameter: inB[0].parameter,
        mineName: inB[0].mineName,
        subsidiary: inB[0].subsidiary,
        oldValue: null,
        newValue: inB.map(r => `${r.value} ${r.unit || ''} (${r.period || ''})`).join('; ')
      });
    } else {
      // Both exist — check if values differ
      const fingerprint = record => JSON.stringify([record.value ?? null, record.unit ?? null, record.period ?? null]);
      const valsA = inA.map(fingerprint).sort().join(',');
      const valsB = inB.map(fingerprint).sort().join(',');
      if (valsA !== valsB) {
        changes.push({
          type: 'changed',
          parameter: inA[0].parameter,
          mineName: inA[0].mineName || inB[0].mineName,
          subsidiary: inA[0].subsidiary || inB[0].subsidiary,
          oldValue: inA.map(r => `${r.value} ${r.unit || ''} (${r.period || ''})`).join('; '),
          newValue: inB.map(r => `${r.value} ${r.unit || ''} (${r.period || ''})`).join('; ')
        });
      }
    }
  }

  return {
    documentA: { id: docIdA, name: docA?.originalName || 'Document A' },
    documentB: { id: docIdB, name: docB?.originalName || 'Document B' },
    totalChanges: changes.length,
    added: changes.filter(c => c.type === 'added').length,
    removed: changes.filter(c => c.type === 'removed').length,
    modified: changes.filter(c => c.type === 'changed').length,
    changes
  };
};

// =============================================
// 5. CROSS-DOCUMENT EVIDENCE LINKING
// =============================================
exports.linkEvidence = async (documentId, user) => {
  const records = await ExtractedRecord.find({ documentId });
  if (records.length === 0) return [];

  const linked = [];

  // Process in batches of 5 to avoid overwhelming RAG
  for (let i = 0; i < Math.min(records.length, 20); i++) {
    const record = records[i];
    const query = `${record.parameter} ${record.value} ${record.unit || ''} ${record.mineName || ''} ${record.period || ''}`.trim();

    try {
      const chunks = await ragService.searchSimilar(query, 3, { user, reqContext: { isComplex: false } });

      // Filter out chunks from the same document
      const crossDocChunks = chunks.filter(c => {
        const chunkDocId = c.documentId?._id || c.documentId;
        return String(chunkDocId) !== String(documentId);
      });

      if (crossDocChunks.length > 0) {
        record.linkedEvidence = crossDocChunks.map(c => ({
          documentId: c.documentId?._id || c.documentId,
          pageNumber: c.pageNumber,
          snippet: (c.content || '').substring(0, 200),
          similarity: c.similarityScore
        }));
        await record.save();
        linked.push({ recordId: record._id, parameter: record.parameter, linkedCount: crossDocChunks.length });
      }
    } catch (err) {
      console.warn(`Evidence linking failed for record ${record._id}:`, err.message);
    }
  }

  return linked;
};

// =============================================
// 6. TOPIC TRENDS (Deterministic aggregation)
// =============================================
exports.getTopicTrends = async () => {
  const topics = await Topic.find({ 'trendData.0': { $exists: true } })
    .select('name trendData weight')
    .lean();

  return topics.map(t => ({
    name: t.name,
    weight: t.weight,
    trends: t.trendData.sort((a, b) => (a.period || '').localeCompare(b.period || ''))
  }));
};

// =============================================
// 7. INTELLIGENCE SUMMARY & CROSS-DOC HELPERS
// =============================================
exports.getIntelligenceSummary = async (user, filters = {}) => {
  const docQuery = documentScope(user);
  if (filters.document) docQuery._id = filters.document;

  const docs = await Document.find(docQuery).select('originalName filename entities similarDocuments').lean();
  const topics = await Topic.find({ documents: { $in: docs.map(document => document._id) } }).lean();

  let totalEntitiesCount = 0;
  docs.forEach(d => {
    if (d.entities && d.entities.length > 0) totalEntitiesCount += d.entities.length;
  });

  return {
    totalDocumentsAnalyzed: docs.length,
    totalEntitiesFound: totalEntitiesCount,
    totalTopicsDiscovered: topics.length,
    crossDocumentSimilaritiesComputed: docs.filter(d => d.similarDocuments && d.similarDocuments.length > 0).length,
    filtersApplied: filters
  };
};

exports.getAllEntities = async (user, filters = {}) => {
  const docQuery = documentScope(user);
  if (filters.document) docQuery._id = filters.document;

  const docs = await Document.find(docQuery).select('originalName entities').lean();
  const recordQuery = { documentId: { $in: docs.map(document => document._id) } };
  if (filters.mine) recordQuery.mineName = { $regex: new RegExp(filters.mine, 'i') };
  if (filters.subsidiary) recordQuery.subsidiary = { $regex: new RegExp(filters.subsidiary, 'i') };

  const records = await ExtractedRecord.find(recordQuery).lean();

  const entityMap = new Map();

  docs.forEach(d => {
    (d.entities || []).forEach(e => {
      const key = `${(e.name || '').toLowerCase()}_${e.type}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { name: e.name, type: e.type, mentions: e.mentions || 1, documents: [d.originalName] });
      } else {
        const existing = entityMap.get(key);
        existing.mentions += (e.mentions || 1);
        if (!existing.documents.includes(d.originalName)) existing.documents.push(d.originalName);
      }
    });
  });

  records.forEach(r => {
    if (r.mineName) {
      const key = `${r.mineName.toLowerCase()}_mine`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { name: r.mineName, type: 'Mine', mentions: 1, documents: [] });
      } else {
        entityMap.get(key).mentions++;
      }
    }
    if (r.subsidiary) {
      const key = `${r.subsidiary.toLowerCase()}_subsidiary`;
      if (!entityMap.has(key)) {
        entityMap.set(key, { name: r.subsidiary, type: 'Subsidiary', mentions: 1, documents: [] });
      } else {
        entityMap.get(key).mentions++;
      }
    }
  });

  const entities = Array.from(entityMap.values());
  const byType = {};
  entities.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
  });

  return {
    totalEntities: entities.length,
    byType,
    entities: entities.sort((a, b) => b.mentions - a.mentions)
  };
};

exports.getClusters = async (user, filters = {}) => {
  const topics = await Topic.find({})
    .populate('relatedTopics.topicId', 'name weight')
    .lean();

  const clusters = topics.map((t, idx) => ({
    clusterId: `cluster_${idx + 1}`,
    name: t.name,
    weight: t.weight || 1.0,
    keywords: t.keywords || [],
    documentCount: (t.documents || []).length,
    relatedTopics: (t.relatedTopics || []).map(r => ({
      name: r.topicId?.name || 'Related Topic',
      strength: r.strength
    }))
  }));

  return {
    totalClusters: clusters.length,
    clusters
  };
};

exports.getSimilarityMatrix = async (user, filters = {}) => {
  if (filters.document) {
    const results = await exports.computeDocumentSimilarity(filters.document, user);
    return { documentId: filters.document, similarDocuments: results };
  }

  const accessible = await Document.find(documentScope(user)).select('_id').lean();
  const accessibleIds = new Set(accessible.map(document => String(document._id)));
  const docs = await Document.find({ ...documentScope(user), 'similarDocuments.0': { $exists: true } })
    .select('originalName filename similarDocuments')
    .populate('similarDocuments.documentId', 'originalName filename')
    .lean();

  const nodes = [];
  const links = [];
  const seenNodes = new Set();

  docs.forEach(doc => {
    const dId = String(doc._id);
    if (!seenNodes.has(dId)) {
      seenNodes.add(dId);
      nodes.push({ id: dId, name: doc.originalName || doc.filename });
    }

    (doc.similarDocuments || []).forEach(sim => {
      const targetId = String(sim.documentId?._id || sim.documentId);
      if (accessibleIds.has(targetId) && sim.score && sim.score > 0.4) {
        links.push({
          source: dId,
          target: targetId,
          score: sim.score
        });
      }
    });
  });

  return { nodes, links };
};
