module.exports = require('mem')(newDynamodb)

const aws = require('./aws')
const promised = require('@buzuli/promised')

function newDynamodb ({ config } = {}) {
  const sdk = new aws.sdk.DynamoDB(config)

  return {
    batchGet: batchGet.bind(null, sdk),
    batchPut: batchPut.bind(null, sdk),
    sdk
  }
}

async function batchGet (sdk, table, items, attributes) {
  const options = { RequestItems: {} }
  const tableKeys = items.map(i => {
    const item = {}
    Object.entries(i).forEach(([column, value]) => {
      item[column] = typedValue(value)
    })
    return item
  })
  options.RequestItems[table] = { Keys: tableKeys, AttributesToGet: attributes }

  const batchData = await promised(h => sdk.batchGetItem(options, h))
  const records = batchData.Responses[table] || []

  return records.map(record => {
    const extracted = {}
    Object.keys(record).forEach(key => {
      extracted[key] = valuedType(record[key])
    })
    return extracted
  })
}

async function batchPut (sdk, table, items) {
  const options = { RequestItems: {} }
  const tableItems = items.map(i => {
    const item = {}
    Object.entries(i).forEach(([column, value]) => {
      item[column] = typedValue(value)
    })
    return {
      PutRequest: {
        Item: item
      }
    }
  })
  options.RequestItems[table] = tableItems

  return promised(h => sdk.batchWriteItem(options, h))
}

function typedValue (value) {
  const vType = typeof value
  let typeKey

  if (vType === 'string') {
    typeKey = { S: value }
  } else if (vType === 'number') {
    typeKey = { N: `${value}` }
  } else if (vType === 'boolean') {
    typeKey = { BOOL: `${value}` }
  } else if (value === null) {
    typeKey = { NULL: true }
  } else if (value instanceof Buffer) {
    typeKey = { B: value }
  } else if (value instanceof Array) {
    typeKey = { L: value.map(typedValue) }
  } else {
    typeKey = { S: value.toString() }
  }

  return typeKey
}

function valuedType (valueObj) {
  const [vType] = Object.keys(valueObj)
  const value = valueObj[vType]
  switch (vType) {
    case 'S':
    case 'B':
      return value
    case 'N': return Number(value) || 0
    case 'BOOL': return Boolean(value)
    case 'L': return value.map(valuedType)
    default: return null
  }
}
