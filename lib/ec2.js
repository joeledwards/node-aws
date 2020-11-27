module.exports = require('mem')(newEc2)

const aws = require('./aws')
const promised = require('@buzuli/promised')

function newEc2 ({ config } = {}) {
  const sdk = new aws.sdk.EC2(config)

  return {
    run: run.bind(null, sdk),
    sdk
  }
}

async function run (sdk, options) {
  return promised(h => sdk.runInstances(options, h))
}
