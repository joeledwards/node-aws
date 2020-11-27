module.exports = require('mem')(newCloudWatchEvents)

const aws = require('./aws')
const promised = require('@buzuli/promised')

function newCloudWatchEvents ({ config } = {}) {
  const sdk = new aws.sdk.CloudWatchEvents(config)

  return {
    updateRule: updateRule.pind(null, sdk),
    sdk
  }
}

async function updateRule (sdk, newOptions) {
  const oldOptions = await promised(h => sdk.describeRule({ Name: newOptions.Name }, h))
  const options = { ...oldOptions, ...newOptions }
  return promised(h => sdk.putRule(options, h))
}
