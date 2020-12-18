const tap = require('tap')

const {
  s3: {
    formatUri,
    parseUri,
    resolveResourceInfo
  }
} = require('../lib/util')

tap.test('util.formatUri()', async assert => {
  assert.equal(formatUri('bar'), 's3://bar/')
  assert.equal(formatUri('bar', 'foo'), 's3://bar/foo')
  assert.equal(formatUri('bar', '/foo'), 's3://bar/foo')
  assert.equal(formatUri('bar', 'foo/'), 's3://bar/foo/')
  assert.equal(formatUri('bar', '/foo/'), 's3://bar/foo/')
  assert.equal(formatUri('/bar', '/foo/'), 's3://bar/foo/')
  assert.equal(formatUri('//bar', '/foo/'), 's3://bar/foo/')
  assert.equal(formatUri('bar/', '/foo/'), 's3://bar/foo/')
  assert.equal(formatUri('bar//', '/foo/'), 's3://bar/foo/')
  assert.equal(formatUri('/bar/', '/foo/'), 's3://bar/foo/')
  assert.equal(formatUri('//bar//', '/foo/'), 's3://bar/foo/')
})

tap.test('util.parseUri()', async assert => {
  assert.same(parseUri('s3://'), {})

  assert.same(parseUri('s3://bkt/key'), { bucket: 'bkt', key: 'key' })
  assert.same(parseUri('s3://bkt/k/p'), { bucket: 'bkt', key: 'k/p' })
  assert.same(parseUri('s3://bkt/k/p/'), { bucket: 'bkt', key: 'k/p/' })
  assert.same(parseUri('s3://bkt/'), { bucket: 'bkt' })
  assert.same(parseUri('s3://bkt'), { bucket: 'bkt' })

  assert.same(parseUri('/bkt'), { bucket: 'bkt' })
  assert.same(parseUri('/bkt/'), { bucket: 'bkt' })
  assert.same(parseUri('/bkt/k/p'), { bucket: 'bkt', key: 'k/p' })
  assert.same(parseUri('/bkt/k/p/'), { bucket: 'bkt', key: 'k/p/' })
  assert.same(parseUri('bkt/'), { bucket: 'bkt' })
  assert.same(parseUri('bkt/key'), { bucket: 'bkt', key: 'key' })
  assert.same(parseUri('bkt/key/'), { bucket: 'bkt', key: 'key/' })
  assert.same(parseUri('bkt/k/p'), { bucket: 'bkt', key: 'k/p' })
  assert.same(parseUri('bkt/k/p/'), { bucket: 'bkt', key: 'k/p/' })
  assert.same(parseUri('bkt/k/p//'), { bucket: 'bkt', key: 'k/p/' })
})

tap.test('util.resolveResourceInfo()', async assert => {
  assert.same(resolveResourceInfo('bkt', 'key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('bkt', 'key/'), { bucket: 'bkt', key: 'key/' })
  assert.same(resolveResourceInfo('bkt', 'key/stuff'), { bucket: 'bkt', key: 'key/stuff' })

  assert.same(resolveResourceInfo('bkt/ignored', 'key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('/bkt/ignored', 'key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('//bkt/ignored', 'key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('s3://bkt/ignored', 'key'), { bucket: 'bkt', key: 'key' })

  assert.same(resolveResourceInfo('/bkt'), { bucket: 'bkt' })
  assert.same(resolveResourceInfo('bkt/key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('/bkt/key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('//bkt/key'), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('s3://bkt/key'), { bucket: 'bkt', key: 'key' })

  assert.same(resolveResourceInfo('s3://bkt/key', undefined), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('s3://bkt/key', null), { bucket: 'bkt', key: 'key' })
  assert.same(resolveResourceInfo('s3://bkt/key', ''), { bucket: 'bkt', key: 'key' })
})
