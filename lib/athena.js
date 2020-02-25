module.exports = require('mem')(newAthena)

const c = require('@buzuli/color')
const fs = require('fs')
const aws = require('./aws')
const newS3 = require('./s3')
const url = require('url')
const sleep = require('./sleep')
const moment = require('moment')
const promised = require('@buzuli/promised')
const prettyBytes = require('pretty-bytes')
const { millis, stopwatch } = require('durations')

const now = () => moment.utc().format('YYYYMMDDHHmmss')

function newAthena (awsConfig) {
  const config = aws.getConfig(awsConfig)
  const sdk = new aws.sdk.Athena(config)
  const s3 = newS3(awsConfig)

  return {
    cancelQuery: cancelQuery.bind(null, sdk),
    loadQuery,
    queryDone: queryDone.bind(null, sdk),
    queryResults: queryResults.bind(null, sdk, s3),
    queryStatus: queryStatus.bind(null, sdk),
    runQuery: runQuery.bind(null, sdk),
    startQuery: startQuery.bind(null, sdk),
    stateColor,
    sdk
  }
}

// Start an Athena query
async function startQuery (sdk, { sinkBucket, resultPrefix, query, token }) {
  return new Promise((resolve, reject) => {
    const prefix = resultPrefix + (token ? `${token}/` : '')
    const outputBaseUrl = `s3://${sinkBucket}/${prefix}`

    const params = {
      QueryString: query,
      ClientRequestToken: token,
      ResultConfiguration: {
        OutputLocation: outputBaseUrl
      }
    }

    sdk.startQueryExecution(params, (error, data) => {
      if (error) {
        reject(error)
      } else {
        const { QueryExecutionId: queryId } = data
        const key = `${prefix}${queryId}.csv`
        const url = `s3://${sinkBucket}/${key}`
        const result = { bucket: sinkBucket, key, url }
        resolve({ queryId, result })
      }
    })
  })
}

// Check on the status for a query
async function queryStatus (sdk, queryId) {
  const data = await promised(h => sdk.getQueryExecution({ QueryExecutionId: queryId }, h))

  const {
    QueryExecution: {
      ResultConfiguration: {
        OutputLocation: outputUri
      },
      Status: {
        State: state
      },
      Statistics: {
        DataScannedInBytes: bytes,
        EngineExecutionTimeInMillis: execTime
      }
    }
  } = data

  return {
    bytes,
    execTime,
    ready: ['CANCELLED', 'FAILED', 'SUCCEEDED'].includes(state),
    state,
    outputUri
  }
}

// Run and monitor query
async function runQuery (sdk, {
  query,
  queryTag,
  sinkBucket,
  resultPrefix = '',
  timeout = 600000,
  pollInterval = 5000,
  progress = true,
  quiet = false
}) {
  const token = `tdat-athena-${queryTag}-query-${now()}`
  try {
    if (!quiet) {
      console.info(`Running ${queryTag} query:\n${c.yellow(query)}`)
    }
    const { queryId, result } = await startQuery(sdk, { sinkBucket, resultPrefix, query, token, quiet })
    if (!quiet) {
      console.info(`Query ${c.yellow(queryId)} started.`)
    }
    const { duration, bytes, timedOut, success } = await queryDone(sdk, queryId, { timeout, pollInterval, progress, quiet })

    return { queryId, result, duration, bytes, token, success, timedOut }
  } catch (error) {
    if (!quiet) {
      console.error(error)
      console.error(c.red(`Error starting Athena query ${c.yellow(token)}. Details above ${c.yellow('^')}`))
    }
    throw error
  }
}

// Wait for a query to complete
async function queryDone (sdk, queryId, options = {}) {
  const {
    timeout = 600000,
    pollInterval = 5000,
    progress = true,
    quiet = false
  } = options

  const watch = stopwatch().start()

  let done = false
  let result = { timedOut: true }
  let lastBytes = 0
  let lastExecTime = 0

  while (!done && watch.duration().millis() < timeout) {
    const delay = Math.max(0, Math.min(pollInterval, timeout - watch.duration().millis()))
    try {
      await sleep(delay)
      const { bytes = 0, execTime = 0, ready, state } = await queryStatus(sdk, queryId)
      const duration = millis(execTime)
      if (lastBytes !== bytes || lastExecTime !== execTime) {
        lastBytes = bytes
        lastExecTime = execTime
        const stateStr = stateColor(state)
        const sizeStr = c.yellow(prettyBytes(bytes))
        const bytesStr = c.orange(bytes.toLocaleString())
        const costStr = c.green((bytes / 1000000000000 * 5.0).toFixed(2))
        const timeStr = c.blue(duration)

        if (progress) {
          console.info(`[${stateStr}] scanned ${sizeStr} (${bytesStr} bytes | $${costStr}) in ${timeStr}`)
        }
      }
      done = ready
      result = { queryId, duration: duration.seconds(), bytes, state, timedOut: !ready, success: state === 'SUCCEEDED' }
    } catch (error) {
      if (!quiet) {
        console.error('query status error:', error)
      }
      throw error
    }
  }

  return result
}

// Fetch results from a completed query
async function queryResults (sdk, s3, queryId, { sampleSize = 1024 } = {}) {
  const { state, ready, outputUri: uri } = await queryStatus(sdk, queryId)

  if (!ready) {
    return { state }
  }

  const { host: bucket, path } = url.parse(uri)
  const key = path.slice(1)

  const {
    ContentLength: dataSize
  } = await s3.head(bucket, key)

  let data
  if (sampleSize !== 0) {
    const s3Params = {}
    if (sampleSize > 0) {
      s3Params.maxBytes = sampleSize
    }
    const { Body: sampleData } = await s3.get(bucket, key, s3Params)
    data = sampleData
  }

  return {
    state,
    uri,
    bucket,
    key,
    data,
    dataSize,
    partial: dataSize > sampleSize
  }
}

// Cancel a running query
async function cancelQuery (sdk, queryId) {
  return promised(h => sdk.stopQueryExecution({ QueryExecutionId: queryId }, h))
}

function stateColor (state) {
  switch (state) {
    case 'QUEUED': return c.grey(state)
    case 'RUNNING': return c.blue(state)
    case 'SUCCEEDED': return c.green(state)
    case 'FAILED': return c.red(state)
    case 'CANCELLED': return c.red(state)
  }
}

// Load a query from a file, injecting substitutions for {{<sub-field>}}
async function loadQuery (fileName, substitutions = {}) {
  const data = await promised(h => fs.readFile(fileName, h))

  return Object
    .entries(substitutions)
    .reduce(
      (query, [name, value]) => query.replace(`{{${name}}}`, value),
      data.toString()
    )
}
