'use strict';
// A fixed pool of worker threads running simTasks.js tasks. Each worker loads the engine once and
// then takes tasks from a shared queue, so long runs can be split into many small seeded blocks
// (for checkpointing and worker-count-independent results) without respawning threads.

const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_FILE = path.join(__dirname, 'simWorker.js');

/** Default worker count: every logical core but one, so the machine stays responsive. */
function defaultWorkerCount() {
  return Math.max(1, os.cpus().length - 1);
}

/**
 * @param {number} size
 * @returns {{ run: (task: object) => Promise<object>, close: () => Promise<void>, size: number }}
 */
function createWorkerPool(size = defaultWorkerCount()) {
  const queue = [];
  const idle = [];
  const callbacks = new Map();
  let nextId = 0;

  function dispatch() {
    while (idle.length && queue.length) {
      const worker = idle.pop();
      const job = queue.shift();
      callbacks.set(job.id, { ...job, worker });
      worker.postMessage({ id: job.id, task: job.task });
    }
  }

  function spawn() {
    const worker = new Worker(WORKER_FILE);
    worker.on('message', ({ id, result, error }) => {
      const job = callbacks.get(id);
      callbacks.delete(id);
      idle.push(worker);
      if (error) job.reject(new Error(error));
      else job.resolve(result);
      dispatch();
    });
    worker.on('error', (err) => {
      for (const [id, job] of callbacks) if (job.worker === worker) { callbacks.delete(id); job.reject(err); }
    });
    idle.push(worker);
    return worker;
  }

  const workers = Array.from({ length: size }, spawn);

  return {
    size,
    run(task) {
      return new Promise((resolve, reject) => {
        queue.push({ id: nextId++, task, resolve, reject });
        dispatch();
      });
    },
    close() {
      return Promise.all(workers.map((w) => w.terminate())).then(() => {});
    },
  };
}

/**
 * Runs blocks [firstBlock, firstBlock + count) of a job on the pool and merges their results.
 * makeTask(blockIndex) must derive the block's seed from blockIndex, so results don't depend on
 * the worker count or on which worker ran which block.
 * @param {{run: Function}} pool
 * @param {{firstBlock?: number, count: number, makeTask: (i: number) => object, merge: Function, onBlock?: Function}} opts
 */
async function runBlocks(pool, { firstBlock = 0, count, makeTask, merge, onBlock }) {
  const results = await Promise.all(Array.from({ length: count }, (_, i) =>
    pool.run(makeTask(firstBlock + i)).then((result) => {
      if (onBlock) onBlock(firstBlock + i);
      return result;
    })));
  // Merged in block order (not finish order) so floating-point sums are bit-reproducible.
  return results.reduce((merged, result) => merge(merged, result), null);
}

module.exports = { createWorkerPool, defaultWorkerCount, runBlocks };
