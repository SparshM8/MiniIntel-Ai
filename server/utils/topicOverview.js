const stopWords = new Set('the and for with from that this these those into onto are was were been being have has had will shall would should could can may might not but also than then their there they them its our your you which what when where who how why all any each other such more most some same very only both about above below between through during before after under over per document page report table figure total'.split(' '));

function buildTopicOverview(documents, topics) {
  const accessibleIds = new Set(documents.map(document => String(document._id)));
  const topicDocumentIds = new Set();
  const data = topics.flatMap(topic => {
    const documentIds = [...new Set((topic.documents || []).map(String))].filter(id => accessibleIds.has(id));
    if (!documentIds.length) return [];
    documentIds.forEach(id => topicDocumentIds.add(id));
    return [{ _id: String(topic._id), name: topic.name, documentCount: documentIds.length }];
  }).sort((first, second) => second.documentCount - first.documentCount || first.name.localeCompare(second.name));

  const words = new Map();
  let processedDocuments = 0;
  for (const document of documents) {
    if (typeof document.extractedText !== 'string' || !document.extractedText.trim()) continue;
    processedDocuments++;
    const seen = new Set();
    const tokens = document.extractedText.normalize('NFKC').toLocaleLowerCase('en').match(/\p{L}[\p{L}\p{M}]*/gu) || [];
    for (const token of tokens) {
      if (token.length < 3 || token.length > 40 || stopWords.has(token)) continue;
      const word = words.get(token) || { text: token, count: 0, documentCount: 0 };
      word.count++;
      if (!seen.has(token)) word.documentCount++;
      seen.add(token);
      words.set(token, word);
    }
  }
  return {
    data,
    meta: { topicCount: data.length, analyzedDocuments: topicDocumentIds.size, processedDocuments },
    wordCloud: [...words.values()].sort((first, second) => second.count - first.count || first.text.localeCompare(second.text)).slice(0, 80)
  };
}

module.exports = { buildTopicOverview };