#!/usr/bin/env node

//require('log-a-log')()

const fs = require('fs')
const os = require('os')
const aws = require('aws-sdk')
const ini = require('ini')
const open = require('open')
const path = require('path')
const moment = require('moment')
const promised = require('@buzuli/promised')
const durations = require('durations')

const awsDir = path.resolve(os.homedir(), '.aws')
const configFile = path.resolve(awsDir, 'config')
const clientDir = path.resolve(awsDir, 'sso', 'cache', 'buzuli-aws')
const clientFile = path.resolve(clientDir, 'client.json')
const accessFile = path.resolve(clientDir, 'access.json')
const credFile = path.resolve(clientDir, 'credentials.json')

const clientName = 'buzuli-aws'
const clientType = 'public'

// https://openid.net/specs/openid-connect-basic-1_0.html#Scopes
const scopes = ['openid', 'profile', 'email']

// https://tools.ietf.org/html/rfc8628
const grantType = 'urn:ietf:params:oauth:grant-type:device_code'

module.exports = {
  getCredentials
}

function getCredentials (config) {
  return new TemporarySsoCredentials(config)
}

class TemporarySsoCredentials extends aws.Credentials {
  constructor (config) {
    super()

    this.initialized = false
    this.config = config
  }

  get expired () {
    if (!this.expiresAt) {
      return true
    }

    return moment.utc(this.expiresAt).diff(moment.utc()) < 1
  }

  set expired (_value) {
    // ignore
  }

  async get (callback = () => {}) {
    try {
      await this.getPromised()
      callback()
    } catch (error) {
      callback(error)
    }
  }

  async getPromised () {
    if (this.needsRefresh()) {
      await this.refreshPromised()
    }
  }

  needsRefresh () {
    return !this.initialized || this.expired
  }

  async refresh (callback = () => {}) {
    try {
      await this.refreshPromised()
      callback()
    } catch (error) {
      callback(error)
    }
  }

  async refreshPromised () {
    const {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      expiresAt,
    } = await getTemporaryCredentials(this.config)

    this.accessKeyId = accessKeyId
    this.secretAccessKey = secretAccessKey
    this.sessionToken = sessionToken
    this.expireTime = moment.utc(expiresAt).toDate()
  }
}

async function getTemporaryCredentials (config) {
  if (config == null) {
    config = await fetchConfig()
  }

  let cred = await fetchCred()

  if (!cred) {
    const { accountId, roleName } = config
    const { accessToken } = await getAccess({ config })

    const sso = new aws.SSO()
    const params = {
      accessToken,
      accountId,
      roleName,
    }

    console.info('Fetching role credentials ...')
    const {
      roleCredentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiration,
      }
    } = await promised(h => sso.getRoleCredentials(params, h))

    const expiresAt = moment.utc(expiration).toISOString()

    cred = {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      expiresAt,
    }

    console.info('Persisting temporary credentials ...')
    await persistCred(cred)
  }

  return cred
}

async function getAccess ({ config, timeout = 120 }) {
  let access = await fetchAccess()

  if (!access) {
    const { startUrl } = config
    const oidc = new aws.SSOOIDC()

    console.info('Time to refresh access info.')
    const client = await getClient({ oidc })

    const {
      clientId,
      clientSecret,
    } = client

    const params = {
      clientId,
      clientSecret,
      startUrl,
    }

    console.info('Starting client authorzation (opening browser) ...')
    const {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn,
      interval: minPollIntervalSeconds,
    } = await promised(h => oidc.startDeviceAuthorization(params, h))

    const pollInterval = durations.seconds(Math.max(minPollIntervalSeconds, 2.5))

    open(verificationUriComplete)

    const watch = durations.stopwatch().start()
    let authorized = false
    while (!authorized) {
      console.info(`Next token create attempt in ${pollInterval} ...`)
      await new Promise(r => setTimeout(r, pollInterval.millis()))
      console.info(`Attempting to create token ...`)

      // Poll until auth completes
      const params = {
        clientId,
        clientSecret,
        deviceCode,
        code: userCode,
        scope: scopes,
        grantType,
      }

      try {
        const {
          accessToken,
          tokenType,
          refreshToken,
          idToken,
          expiresIn
        } = await promised(h => oidc.createToken(params, h))
        console.info('Token created.')

        const expiresAt = moment.utc().add(expiresIn, 'seconds')
        access = {
          tokenType,
          idToken,
          accessToken,
          refreshToken,
          expiresAt,
        }

        await persistAccess(access)

        authorized = true
      } catch (error) {
        console.error('Failed to create token:', error)
      }

      if (watch.duration().seconds() > timeout) {
        throw Error('Timeout trying to create token.')
      }
    }
  }

  return access
}

async function getClient ({ oidc }) {
  let client = await fetchClient()

  if (!client) {
    console.info('Registering client ...')
    const params = {
      clientName,
      clientType,
      scopes,
    }

    const {
      clientId,
      clientSecret,
      clientSecretExpiresAt: expireEpochSeconds,
    } = await promised(h => oidc.registerClient(params, h))
    console.info('Client registered.')

    const expiresAt = moment.utc(expireEpochSeconds * 1000).toISOString()
    client = {
      clientId,
      clientSecret,
      expiresAt,
    }
    await persistClient(client)
  }

  return client
}

async function persistClient (client) {
  console.info('Persisting client info ...')
  await promised(h => fs.mkdir(clientDir, { recursive: true }, h))
  await promised(h => fs.writeFile(clientFile, JSON.stringify(client), h))
}

async function persistAccess (access) {
  console.info('Persisting access data ...')
  await promised(h => fs.writeFile(accessFile, JSON.stringify(access), h))
}

async function persistCred (cred) {
  console.info('Persisting temporary credentials ...')
  await promised(h => fs.writeFile(credFile, JSON.stringify(cred), h))
}

async function fetchClient () {
  try {
    //console.info('Fetching client info ...')
    const raw = await promised(h => fs.readFile(clientFile, 'utf-8', h))
    const record = JSON.parse(raw)

    if (moment.utc(record.expiresAt).diff(moment.utc()) < 300) {
      //console.warn('Client registration record expired.')
      return null
    } else {
      //console.info('Client registration record found.')
      return record
    }
  } catch (error) {
    //console.warn('No client registration record found.')
    return null
  }
}

async function fetchAccess () {
  try {
    //console.info('Fetching access data ...')
    const raw = await promised(h => fs.readFile(accessFile, 'utf-8', h))
    const record = JSON.parse(raw)

    if (moment.utc(record.expiresAt).diff(moment.utc()) < 300) {
      //console.warn('Cached access info expired.')
      return null
    } else {
      //console.info('Cached access info found.')
      return record
    }
  } catch (error) {
    //console.warn('No client access info cached.')
    return null
  }
}

async function fetchCred () {
  try {
    //console.info('Fetching credentials ...')
    const raw = await promised(h => fs.readFile(credFile, 'utf-8', h))
    const record = JSON.parse(raw)

    if (moment.utc(record.expiresAt).diff(moment.utc()) < 300) {
      //console.warn('Cached credentials expired.')
      return null
    } else {
      //console.info('Cached credentials found.')
      return record
    }
  } catch (error) {
    //console.warn('No client credentials cached.')
    return null
  }
}

function coalesce () {
  for (const arg of arguments) {
    if (arg != null) return arg
  }
}

async function fetchConfig ({ profile = 'default'} = {}) {
  try {
    //console.info('Fetching AWS config ...')
    const raw = await promised(h => fs.readFile(configFile, 'utf-8', h))
    const record = ini.parse(raw)

    profile = coalesce(
      record[`profile ${profile}`],
      record[`profile.${profile}`],
      record[`${profile}`],
      {}
    )

    const {
      sso_start_url: startUrl,
      sso_region: region,
      sso_account_id: accountId,
      sso_role_name: roleName
    } = profile

    if (startUrl == null || accountId == null || roleName == null) {
      return null
    }

    return {
      startUrl,
      region,
      accountId,
      roleName
    }
  } catch (error) {
    throw new Error('AWS SSO config not found.')
  }
}
