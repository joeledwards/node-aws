const sdk = require('aws-sdk')
const auth = require('./auth')
const promised = require('@buzuli/promised')

module.exports = {
  configureSdk,
  resolveSdk,
  sdk
}

sdk.config.credentials = auth.getCredentialChain()

async function configureSdk ({ credentials, region }) {
  if (region != null) {
    sdk.config.region = region
  }

  sdk.config.credentials = credentials

  return sdk
}

async function resolveSdk ({ region } = {}) {
  const credentials = await auth.resolveCredentials()

  return configureSdk({ credentials, region })
}
