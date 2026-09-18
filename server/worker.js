const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const ProcessingJob = require('./models/ProcessingJob');
const { runOnce } = require('./services/processingWorker');

async function main() {
  require('./services/processingTask').processingTimeout();
  if (process.env.VERCEL) throw new Error('Run the processing worker on a persistent Node host, not a serverless function');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  let stopping = false;
  const abort = new AbortController();
  const stop = () => { stopping = true; abort.abort(); };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') {
      throw new Error('Durable processing requires a MongoDB replica set or sharded cluster');
    }
    await ProcessingJob.createIndexes();
    console.log('Processing worker ready (one active document per worker)');
    while (!stopping) {
      try {
        if (await runOnce()) continue;
      } catch (error) {
        console.error('Processing worker iteration failed:', error.message);
      }
      if (!stopping) await delay(2000, undefined, { signal: abort.signal }).catch(error => {
        if (error.name !== 'AbortError') throw error;
      });
    }
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await mongoose.disconnect();
  }
}

if (require.main === module) main().catch(error => {
  console.error('Processing worker startup failed:', error.message);
  process.exitCode = 1;
});

module.exports = { main };