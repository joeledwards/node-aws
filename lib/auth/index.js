const sdk = require('aws-sdk')
const sso = require('./sso')
const promised = require('@buzuli/promised')

module.exports = {
  getCredentialChain,
  resolveCredentials,
  sso,
  sdk
}

function getCredentialChain (options = {}) {
  const chain = new sdk.CredentialProviderChain()
  chain.providers.unshift(() => sso.getCredentials(options))
  return chain
}

async function resolveCredentials (options = {}) {
  const chain = getCredentialChain(options)

  return await promised(h => chain.resolve(h))
}
