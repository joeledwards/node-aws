#!/usr/bin/env node

// require('log-a-log')()

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

function getCredentials (options = {}) {
  return new TemporarySsoCredentials(options)
}

class Logger {
  constructor (options = {}) {
    const {
      logger = console,
      verbose = false,
      quiet = false
    } = options

    this._logger = logger
    this._verbose = verbose
    this._quiet = quiet
  }

  error (message) {
    if (typeof this._logger.error === 'function') {
      this._logger.error(message)
    } else {
      this._logger.info(message)
    }
  }

  warn (message) {
    if (typeof this._logger.warn === 'function') {
      this._logger.warn(message)
    } else {
      this._logger.info(message)
    }
  }

  info (message) {
    if (!this._quiet) {
      this._logger.info(message)
    }
  }

  verbose (message) {
    if (this._verbose && !this._quiet) {
      if (typeof this._logger.verbose === 'function') {
        this._logger.verbose(message)
      } else {
        this._logger.info(message)
      }
    }
  }
}

class TemporarySsoCredentials extends aws.Credentials {
  constructor (options = {}) {
    super()

    const {
      logger,
      config,
      profile = 'default',
      quiet = false,
      verbose = false,
      timeout = 120
    } = options

    this.initialized = false
    this.profile = profile
    this.timeout = timeout
    this.config = config
    this.logger = new Logger({ logger, quiet, verbose })
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
    try {
      const {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiresAt
      } = await this.getTemporaryCredentials()

      this.accessKeyId = accessKeyId
      this.secretAccessKey = secretAccessKey
      this.sessionToken = sessionToken
      this.expireTime = moment.utc(expiresAt).toDate()
    } catch (error) {
      this.logger.verbose(`Failed to resolve credentials: ${error}`)
      throw error
    }
  }

  async getTemporaryCredentials () {
    if (this.config == null) {
      this.config = await this.fetchConfig()
    }

    let cred = await this.fetchCred()

    if (cred == null) {
      const { accountId, roleName } = this.config
      const { accessToken } = await this.getAccess()

      const sso = new aws.SSO()
      const params = {
        accessToken,
        accountId,
        roleName
      }

      this.logger.verbose('Fetching role credentials ...')
      const {
        roleCredentials: {
          accessKeyId,
          secretAccessKey,
          sessionToken,
          expiration
        }
      } = await promised(h => sso.getRoleCredentials(params, h))

      const expiresAt = moment.utc(expiration).toISOString()

      cred = {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiresAt
      }

      this.logger.verbose('Persisting temporary credentials ...')
      await this.persistCred(cred)
    }

    return cred
  }

  async getAccess () {
    let access = await this.fetchAccess()

    if (access == null) {
      const { startUrl } = this.config
      const oidc = new aws.SSOOIDC()

      this.logger.info('Time to refresh access info.')
      const client = await this.getClient(oidc)

      const {
        clientId,
        clientSecret
      } = client

      const params = {
        clientId,
        clientSecret,
        startUrl
      }

      this.logger.info('Starting client authorzation (opening browser) ...')
      const {
        deviceCode,
        userCode,
        verificationUriComplete,
        interval: minPollIntervalSeconds
      } = await promised(h => oidc.startDeviceAuthorization(params, h))

      const pollInterval = durations.seconds(Math.max(minPollIntervalSeconds, 2.5))

      open(verificationUriComplete)

      const watch = durations.stopwatch().start()
      let authorized = false
      while (!authorized) {
        this.logger.verbose(`Next token create attempt in ${pollInterval} ...`)
        await new Promise(resolve => setTimeout(resolve, pollInterval.millis()))
        this.logger.verbose('Attempting to create token ...')

        // Poll until auth completes
        const params = {
          clientId,
          clientSecret,
          deviceCode,
          code: userCode,
          scope: scopes,
          grantType
        }

        try {
          const {
            accessToken,
            tokenType,
            refreshToken,
            idToken,
            expiresIn
          } = await promised(h => oidc.createToken(params, h))

          this.logger.info('Token created.')

          const expiresAt = moment.utc().add(expiresIn, 'seconds')
          access = {
            tokenType,
            idToken,
            accessToken,
            refreshToken,
            expiresAt
          }

          await this.persistAccess(access)

          authorized = true
        } catch (error) {
          this.logger.verbose('Failed to create token:', error)
        }

        if (watch.duration().seconds() > this.timeout) {
          throw Error('Timeout trying to create token.')
        }
      }
    }

    return access
  }

  async getClient (oidc) {
    let client = await this.fetchClient()

    if (client == null) {
      this.logger.info('Registering client ...')
      const params = {
        clientName,
        clientType,
        scopes
      }

      const {
        clientId,
        clientSecret,
        clientSecretExpiresAt: expireEpochSeconds
      } = await promised(h => oidc.registerClient(params, h))
      this.logger.info('Client registered.')

      const expiresAt = moment.utc(expireEpochSeconds * 1000).toISOString()
      client = {
        clientId,
        clientSecret,
        expiresAt
      }
      await this.persistClient(client)
    }

    return client
  }

  async persistClient (client) {
    this.logger.verbose('Persisting client info ...')
    await promised(h => fs.mkdir(clientDir, { recursive: true }, h))
    await promised(h => fs.writeFile(clientFile, JSON.stringify(client), h))
  }

  async persistAccess (access) {
    this.logger.verbose('Persisting access data ...')
    await promised(h => fs.writeFile(accessFile, JSON.stringify(access), h))
  }

  async persistCred (cred) {
    this.logger.verbose('Persisting temporary credentials ...')
    await promised(h => fs.writeFile(credFile, JSON.stringify(cred), h))
  }

  async fetchClient () {
    try {
      this.logger.verbose('Fetching client info ...')
      const raw = await promised(h => fs.readFile(clientFile, 'utf-8', h))
      const record = JSON.parse(raw)

      if (moment.utc(record.expiresAt).diff(moment.utc()) < 300) {
        this.logger.info('Client registration record expired.')
        return null
      } else {
        this.logger.verbose('Client registration record found.')
        return record
      }
    } catch (error) {
      this.logger.verbose('No client registration record found.')
      return null
    }
  }

  async fetchAccess () {
    try {
      this.logger.verbose('Fetching access data ...')

      const raw = await promised(h => fs.readFile(accessFile, 'utf-8', h))
      const record = JSON.parse(raw)

      if (moment.utc(record.expiresAt).diff(moment.utc()) < 300) {
        this.logger.verbose('Cached access info expired.')
        return null
      } else {
        this.logger.verbose('Cached access info found.')
        return record
      }
    } catch (error) {
      this.logger.verbose('No client access info cached.')
      return null
    }
  }

  async fetchCred () {
    try {
      this.logger.verbose('Fetching credentials ...')
      const raw = await promised(h => fs.readFile(credFile, 'utf-8', h))
      const record = JSON.parse(raw)

      if (moment.utc(record.expiresAt).diff(moment.utc()) < 300) {
        this.logger.verbose('Cached credentials expired.')
        return null
      } else {
        this.logger.verbose('Cached credentials found.')
        return record
      }
    } catch (error) {
      this.logger.verbose('No client credentials cached.')
      return null
    }
  }

  async fetchConfig () {
    try {
      this.logger.verbose(`Fetching AWS config from ${configFile} ...`)
      const raw = await promised(h => fs.readFile(configFile, 'utf-8', h))
      const record = ini.parse(raw)

      const profile = coalesce(
        record[`profile ${this.profile}`],
        record[`profile.${this.profile}`],
        record[`${this.profile}`],
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
}

function coalesce () {
  for (const arg of arguments) {
    if (arg != null) return arg
  }
}
