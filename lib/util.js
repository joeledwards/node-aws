const c = require('@buzuli/color')
const url = require('@buzuli/url')
const {
  trim,
  trimRight,
  trimLeft
} = require('@buzuli/util')

module.exports = {
  s3: {
    formatUri,
    parseUri,
    resolveResourceInfo
  }
}

function formatUri (bucket, key, { color = false } = {}) {
  const b = trim('/')(bucket)
  const k = trimRight('/', { keep: 1 })(trimLeft('/')(key))

  if (color) {
    return `${c.green('s3')}://${c.blue(b)}/${c.yellow(k)}`
  } else {
    return `s3://${b}/${k}`
  }
}

function parseUri (uri) {
  const {
    protocol,
    host,
    path
  } = url.parse(uri)

  let bucket
  let key

  if (protocol === 's3:') {
    if (host) {
      bucket = host

      if (path && path !== '/') {
        key = trimLeft('/')(path)
      }
    } else {
      bucket = trimLeft('/')(path)
    }
  } else {
    bucket = trimLeft('/')(uri)
  }

  if (!key) {
    const pivot = bucket.indexOf('/')

    if (pivot > 0) {
      key = trimLeft('/')(bucket.slice(pivot))
      bucket = bucket.slice(0, pivot)
    }
  }

  key = key ? trimRight('/', { keep: 1 })(key) : undefined
  bucket = trim('/')(bucket)

  const result = {}

  if (bucket) {
    result.bucket = bucket
  }

  if (key) {
    result.key = key
  }

  return result
}

function resolveResourceInfo (bucketOrUri, deleteKey) {
  const info = deleteKey
    ? { bucket: parseUri(bucketOrUri).bucket, key: deleteKey }
    : parseUri(bucketOrUri)

  return info
}
