'use strict';
// Worker-thread entry point for workerPool.js: runs one simTasks.js task per message.

const { parentPort } = require('worker_threads');
const { runTask } = require('./simTasks');

parentPort.on('message', ({ id, task }) => {
  try {
    parentPort.postMessage({ id, result: runTask(task) });
  } catch (err) {
    parentPort.postMessage({ id, error: err.stack || String(err) });
  }
});
