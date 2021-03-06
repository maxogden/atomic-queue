var events = require('events')
var inherits = require('inherits')
var createWorker = require('./worker.js')
var debug = require('debug')('atomic-queue-pool')

module.exports = Pool

function Pool (workerTemplate, opts) {
  if (!(this instanceof Pool)) return new Pool(workerTemplate, opts)
  if (!opts) opts = {}
  this.workerTemplate = workerTemplate
  this.working = 0
  this.limit = opts.concurrency || 1
  this.workers = this.createWorkers()
  events.EventEmitter.call(this)
}

inherits(Pool, events.EventEmitter)

Pool.prototype.createWorkers = function createWorkers () {
  var self = this
  var workers = []
  var useExistingWorkers = false
  if (Array.isArray(this.workerTemplate)) useExistingWorkers = true

  for (var i = 0; i < this.limit; i++) {
    var workFn = useExistingWorkers ? this.workerTemplate[i] : this.workerTemplate

    // if insufficient number of workers was passed in then return early
    if (!workFn) return workers

    var worker = createWorker(workFn)

    // consolidate events
    worker.on('start', function onStart (data, change) {
      self.emit('start', data, worker, change)
    })

    worker.on('finish', function onFinish (output, data, change) {
      self.emit('finish', output, data, worker, change)
    })

    workers.push(worker)
  }

  debug('created workers', {count: workers.length})

  return workers
}

Pool.prototype.getFree = function getFree (cb) {
  var self = this

  // try to get a free worker
  for (var i = 0; i < this.workers.length; i++) {
    var worker = this.workers[i]
    if (!worker.available) continue
    debug('found free worker')
    worker.available = false
    return cb(worker)
  }

  // otherwise wait for one to finish
  wait()

  function wait () {
    debug('waiting on free worker')
    self.once('finish', function finish (output, data, worker, change) {
      // handle case where getFree is waiting on multiple workers
      process.nextTick(function next () {
        if (!worker.available) return wait()
        debug('waited for free worker, just got one')
        worker.available = false
        cb(worker)
      })
    })
  }
}
