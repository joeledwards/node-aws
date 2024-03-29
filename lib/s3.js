module.exports = require('mem')(newS3)

const aws = require('./aws')
const moment = require('moment')
const promised = require('@buzuli/promised')
const { s3: util } = require('./util')

function newS3 ({ config } = {}) {
  const sdk = new aws.sdk.S3(config)

  return {
    buckets: buckets.bind(null, sdk),
    get: get.bind(null, sdk),
    getKeys: getKeys.bind(null, sdk),
    getPrefixes: getPrefixes.bind(null, sdk),
    head: head.bind(null, sdk),
    put: put.bind(null, sdk),
    scanKeys: scanKeys.bind(null, sdk),
    scanLog: scanLog.bind(null, sdk),
    scanLogs: scanLogs.bind(null, sdk),
    scanMpu: scanMpu.bind(null, sdk),
    select: select.bind(null, sdk),
    stream: stream.bind(null, sdk),
    transform: transform.bind(null, sdk),
    upload: upload.bind(null, sdk),
    whenExists: whenExists.bind(null, sdk),
    util,
    sdk
  }
}

async function buckets (sdk) {
  const { Buckets: buckets } = await promised(h => sdk.listBuckets(h))
  return buckets.map(({ Name: bucket, CreationDate: created }) => ({ bucket, created }))
}

async function get (sdk, bucket, key, { maxBytes = 0 } = {}) {
  const options = {
    Bucket: bucket,
    Key: key
  }

  if (maxBytes > 0) {
    options.Range = `bytes=0-${maxBytes - 1}`
  }

  return promised(h => sdk.getObject(options, h))
}

async function getPrefixes (sdk, bucket, prefix, options = {}) {
  const {
    delimiter = '/',
    includePrefixes = [],
    token
  } = options

  const params = {
    Bucket: bucket,
    Prefix: prefix,
    Delimiter: delimiter
  }

  if (token) {
    params.ContinuationToken = token
  }

  const result = await promised(h => sdk.listObjectsV2(params, h))
  const {
    CommonPrefixes: commonPrefixes = [],
    IsTruncated: truncated,
    NextContinuationToken: nextToken
  } = result

  const prefixes = commonPrefixes.map(({ Prefix: prefix }) => prefix)
  const resultPrefixes = includePrefixes ? includePrefixes.concat(prefixes) : prefixes

  if (truncated && nextToken && prefixes.length > 0) {
    return getPrefixes(sdk, bucket, prefix, { delimiter, includePrefixes: resultPrefixes, token: nextToken })
  } else {
    return resultPrefixes
  }
}

async function getKeys (sdk, bucket, prefix, options = {}) {
  let total = 0
  const {
    logger,
    progress
  } = options

  const logProgress = (logger && (typeof logger.info === 'function')) ? logger.info.bind(logger) : null
  const sendProgress = (typeof progress === 'function') ? progress : null

  const notify = require('@buzuli/throttle')({
    reportFunc: count => {
      if (logProgress) {
        logProgress(`... ${count} new keys (${total} total)`)
      }
      if (sendProgress) {
        sendProgress({ count, total })
      }
    }
  })

  try {
    const keyCollection = scanKeys(sdk, bucket, prefix, options)

    const keys = []
    for await (const key of keyCollection) {
      keys.push(key)
      total++
      notify()
    }

    notify({ halt: true, force: true })

    return keys
  } catch (error) {
    notify({ halt: true })
    throw error
  }
}

async function head (sdk, bucket, key) {
  return promised(h => sdk.headObject({ Bucket: bucket, Key: key }, h))
}

async function put (sdk, bucket, key, payload, options = {}) {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: payload
  }

  const {
    contentEncoding,
    contentType,
    metadata,
    publish = false,
  } = options

  if (contentEncoding) {
    params.ContentEncoding = contentEncoding
  }

  if (contentType) {
    params.ContentType = contentType
  }

  if (metadata) {
    params.Metadata = metadata
  }

  if (publish) {
    params.ACL = 'public-read'
  }

  return promised(h => sdk.putObject(params, h))
}

async function * scanKeys (sdk, bucket, prefix, options = {}) {
  const {
    limit,
    delimiter,
    includeMetadata = false
  } = options

  let remaining = limit
  let more = true
  let continuationToken

  const shouldFetchMore = () => {
    if (!more) { return false }
    if (limit == null) { return true }
    return remaining > 0
  }

  while (shouldFetchMore()) {
    const {
      keys,
      truncated,
      token
    } = await nextBatch(bucket, prefix, continuationToken, remaining)

    continuationToken = token
    more = truncated

    for (const key of keys) {
      if (remaining) {
        remaining--
      }

      yield key
    }
  }

  async function nextBatch (bucket, prefix, continuationToken, limit) {
    const options = {
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: delimiter
    }

    if (continuationToken != null) {
      options.ContinuationToken = continuationToken
    }

    if (limit != null) {
      options.MaxKeys = Math.min(limit, 1000)
    }

    const result = await promised(h => sdk.listObjectsV2(options, h))

    const {
      Contents: objects,
      IsTruncated: truncated,
      NextContinuationToken: token
    } = result

    const keys = objects.map(({
      Key: key,
      LastModified: timestamp,
      ETag: etag,
      Size: size
    }) => {
      if (includeMetadata) {
        return {
          key,
          timestamp: moment.utc(timestamp),
          etag,
          size
        }
      } else {
        return key
      }
    })

    return {
      keys,
      truncated,
      token
    }
  }
}

async function scanLog (sdk, bucket, key, scanner) {
  const meter = require('@buzuli/meter')
  const byline = require('byline')
  const gunzip = require('gunzip-maybe')

  return new Promise((resolve, reject) => {
    const inputStream = stream(sdk, bucket, key)
    const metrics = meter()

    const errorHandler = error => reject(error)
    const endHandler = () => resolve({ lines: metrics.get('lines') })

    const gunzipStream = gunzip()
    const lineStream = byline.createStream()

    // Handle errors
    inputStream.once('error', errorHandler)
    lineStream.once('error', errorHandler)
    gunzipStream.once('error', errorHandler)

    // Handle end of stream
    lineStream.once('end', endHandler)

    // Handle lines
    lineStream.on('data', line => {
      try {
        scanner(line.toString())
      } catch (error) {
        reject(error)
      }
    })

    // Wire up the pipeline
    inputStream.pipe(gunzipStream).pipe(lineStream)
  })
}

async function scanLogs (sdk, bucket, prefix, scanner, { keyFilter } = {}) {
  const keys = scanKeys(sdk, bucket, prefix)
  const filterKey = (typeof keyFilter === 'function') ? keyFilter : () => true

  for await (const key of keys) {
    if (filterKey(key)) {
      await scanLog(sdk, bucket, key, line => {
        scanner({ line, key })
      })
    }
  }
}

async function * scanMpu (sdk, bucket, options = {}) {
  const {
    prefix,
    delimiter,
    limit
  } = options

  let remaining = limit
  let more = true
  let idMarker
  let keyMarker

  const shouldFetchMore = () => {
    if (!more) { return false }
    if (limit == null) { return true }
    return remaining > 0
  }

  while (shouldFetchMore()) {
    const {
      uploads,
      truncated,
      markers
    } = await nextBatch(keyMarker, idMarker, remaining)

    more = truncated
    keyMarker = markers.key
    idMarker = markers.id

    for (const upload of uploads) {
      if (remaining) {
        remaining--
      }

      yield upload
    }
  }

  async function nextBatch (keyMarker, idMarker, limit) {
    const options = {
      Bucket: bucket,
      Prefix: prefix,
      Delimiter: delimiter,
      KeyMarker: keyMarker,
      UploadIdMarker: idMarker
    }

    if (limit != null) {
      options.MaxUploads = Math.min(limit, 1000)
    }

    const result = await promised(h => sdk.listMultipartUploads(options, h))

    const {
      Uploads: mpuUploads,
      IsTruncated: truncated,
      NextKeyMarker: nextKeyMarker,
      NextUploadIdMarker: nextIdMarker
    } = result

    const uploads = mpuUploads.map(({
      Initiated: initiated,
      Key: key,
      UploadId: id
    }) => {
      return {
        bucket,
        key,
        id,
        initiated: moment(initiated)
      }
    })

    return {
      uploads,
      truncated,
      markers: {
        key: nextKeyMarker,
        id: nextIdMarker
      }
    }
  }
}

function select (sdk, bucket, key, query, progress = false) {
  const stream = require('stream')
  let chunks = 0

  const tStream = new stream.Transform({
    objectMode: true,
    transform: (event, encoding, callback) => {
      const {
        Cont: cont,
        Progress: progress,
        Stats: stats,
        Records: {
          Payload: payload
        } = {}
      } = event

      if (payload) {
        chunks++
        callback(null, payload)
      } else {
        callback()

        if (cont) {
          tStream.emit('cont', cont)
        } else if (cont) {
          tStream.emit('progress', progress)
        } else if (stats) {
          const {
            Details: {
              BytesScanned: scanned,
              BytesProcessed: processed,
              BytesReturned: returned
            }
          } = stats

          tStream.emit('stats', {
            bytes: {
              scanned,
              processed,
              returned
            },
            chunks
          })
        }
      }
    }
  })

  const options = {
    Bucket: bucket,
    Key: key,
    ExpressionType: 'SQL',
    Expression: query,
    InputSerialization: {
      CompressionType: 'GZIP',
      JSON: {
        Type: 'LINES'
      }
    },
    OutputSerialization: {
      JSON: {
        RecordDelimiter: '\n'
      }
    },
    RequestProgress: {
      Enabled: progress
    }
  }

  sdk.selectObjectContent(options, (error, { Payload: inputStream }) => {
    if (error) {
      process.nextTick(() => tStream.emit('error', error))
    } else {
      inputStream.pipe(tStream)
    }
  })

  return tStream
}

function stream (sdk, bucket, key) {
  return sdk
    .getObject({
      Bucket: bucket,
      Key: key
    })
    .createReadStream()
}

async function transform (sdk, srcBucket, srcKey, dstBucket, dstKey, options = {}) {
  const zlib = require('zlib')
  const meter = require('@buzuli/meter')
  const byline = require('byline')
  const gunzip = require('gunzip-maybe')
  const { Transform } = require('stream')

  return new Promise((resolve, reject) => {
    try {
      const {
        transformer,
        contentType,
        gzip = false,
        ignoreTransformErrors = false,
        partSize = 20 * 1024 * 1024,
        publish = false,
        queueSize = 1
      } = options

      const hasTransformer = typeof transformer === 'function'
      const metrics = meter()
      metrics.set('total', 0)
      metrics.set('transformed', 0)
      metrics.set('filtered', 0)
      metrics.set('errored', 0)

      // Fetch the source object as a stream.
      const s3Stream = stream(sdk, srcBucket, srcKey)

      // Decompress the stream.
      const gunzipStream = gunzip()

      // The streams in pipeline order.
      const streams = [
        { stream: s3Stream, name: 'S3 get stream' },
        { stream: gunzipStream, name: 'gunzip stream' }
      ]

      // If there is not transformer function, we will simply forward the data.
      if (hasTransformer) {
        // Split the stream on newlines.
        const lineStream = byline.createStream()
        streams.push({ stream: lineStream, name: 'line stream' })

        // Transform each record.
        const transformStream = new Transform({
          transform: (chunk, encoding, callback) => {
            let metric = 'filtered'
            try {
              metrics.add('total')
              const line = transformer(chunk.toString())

              if (typeof line === 'string') {
                metric = 'transformed'
                callback(null, Buffer.from(line + '\n'))
              } else {
                callback()
              }
            } catch (error) {
              if (ignoreTransformErrors) {
                metric = 'errored'
                callback()
              } else {
                throw error
              }
            }
            metrics.add(metric)
          }
        })
        streams.push({ stream: transformStream, name: 'transform stream' })
      }

      if (gzip) {
        // Compress the transformed data.
        const gzipStream = zlib.createGzip()
        streams.push({ stream: gzipStream, name: 'gzip stream' })
      }

      const [{ stream: finalStream }] = streams.slice(-1)

      // Clean up all streams then reject on error
      const errorCleanup = error => {
        streams.forEach(({ stream, name }) => {
          try {
            reject(error)
            stream.removeAllListeners('close')
            stream.destroy()
          } catch (error) {
            console.error(`Error destroying ${name}:`, error)
          }
        })
      }

      // Setup the error handler for all streams
      streams.forEach(({ stream, name }) => stream.on('error', error => {
        console.error(`Error in ${name}:`, error)
        errorCleanup(error)
      }))

      // Connect the streams
      streams.reduce((pipeline, { stream }) => pipeline ? pipeline.pipe(stream) : stream, null)

      const uploadParams = {
        Bucket: dstBucket,
        Key: dstKey,
        Body: finalStream
      }

      if (contentType) {
        uploadParams.ContentType = contentType
      }

      if (gzip) {
        uploadParams.ContentEncoding = 'gzip'
      }

      if (publish) {
        uploadParams.ACL = 'public-read'
      }

      const uploadOptions = {
        partSize,
        queueSize
      }

      // Upload the transformed log archive to S3
      sdk.upload(uploadParams, uploadOptions, (error, data) => {
        if (error) {
          console.error('Error uploading the log archive:', error)
          errorCleanup(error)
        } else {
          resolve({ ...metrics.asObject() })
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

async function upload (sdk, bucket, key, stream, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      contentType,
      contentEncoding,
      partSize = 20 * 1024 * 1024,
      publish = false,
      queueSize = 1
    } = options

    const uploadParams = {
      Bucket: bucket,
      Key: key,
      Body: stream
    }

    const uploadOptions = {
      partSize,
      queueSize
    }

    if (contentType) {
      uploadParams.ContentType = contentType
    }

    if (contentEncoding) {
      uploadParams.ContentEncoding = contentEncoding
    }

    if (publish) {
      uploadParams.ACL = 'public-read'
    }

    sdk.upload(uploadParams, uploadOptions, (error, data) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

async function whenExists (sdk, bucket, key) {
  return promised(h => sdk.waitFor('objectExists', { Bucket: bucket, Key: key }, h))
}
