const sdk = require('aws-sdk')
const sso = require('./sso')
const promised = require('@buzuli/promised')

module.exports = {
  getCredentialChain,
  resolveCredentials,
  sso,
  sdk
}

function getCredentialChain () {
  const chain = new sdk.CredentialProviderChain()
  chain.providers.unshift(() => sso.getCredentials())
  return chain
}

async function resolveCredentials () {
  const chain = getCredentialChain()

  return await promised(h => chain.resolve(h))
}
