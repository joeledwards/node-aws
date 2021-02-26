const sdk = require('aws-sdk')
const auth = require('./auth')

module.exports = {
  configureSdk,
  resolveSdk,
  sdk
}

sdk.config.credentials = auth.getCredentialChain()

function configureSdk ({ credentials, region }) {
  if (region != null) {
    sdk.config.region = region
  }

  sdk.config.credentials = credentials

  return sdk
}

async function resolveSdk (options = {}) {
  const { region } = options
  const credentials = await auth.resolveCredentials(options)

  return configureSdk({ credentials, region })
}
