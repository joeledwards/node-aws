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
const buzJson = require('@buzuli/json')

const Logger = require('./logger')

const awsDir = path.resolve(os.homedir(), '.aws')
const configFile = path.resolve(awsDir, 'config')
const clientDir = path.resolve(awsDir, 'sso', 'cache', 'buzuli-aws')

const clientName = 'buzuli-aws'
const clientType = 'public'

// https://openid.net/specs/openid-connect-basic-1_0.html#Scopes
const scopes = ['openid', 'profile', 'email']

// https://tools.ietf.org/html/rfc8628
const grantType = 'urn:ietf:params:oauth:grant-type:device_code'

const FIVE_MINUTES = 5 * 60 * 1000

module.exports = {
  getCredentials
}

function getCredentials (options = {}) {
  return new TemporarySsoCredentials(options)
}

class TemporarySsoCredentials extends aws.Credentials {
  constructor (options = {}) {
    super()

    const {
      logger,
      config,
      profile,
      quiet: loggerQuiet,
      verbose: loggerVerbose,
      timeout
    } = options

    const quiet = coalesce(loggerQuiet, process.env.BUZULI_AWS_QUIET, false)
    const verbose = coalesce(loggerVerbose, process.env.BUZULI_AWS_VERBOSE, false)

    this.quiet = quiet
    this.verbose = verbose
    this.initialized = false
    this.profile = coalesce(profile, process.env.BUZULI_AWS_PROFILE, process.env.AWS_PROFILE, 'default')
    this.timeout = coalesce(timeout, numeric(process.env.BUZULI_AWS_AUTH_TIMEOUT), 120)
    this.config = config
    this.logger = new Logger({ logger, quiet, verbose })

    this.profileToken = Buffer.from(this.profile).toString('hex')
    this.clientFile = path.resolve(clientDir, `client.${this.profileToken}.json`)
    this.accessFile = path.resolve(clientDir, `access.${this.profileToken}.json`)
    this.credentialsFile = path.resolve(clientDir, `credentials.${this.profileToken}.json`)

    this.failedOn = null

    this.logger.verbose(`profile="${this.profile}"`)
    this.logger.verbose(`profileToken="${this.profileToken}"`)
  }

  get expired () {
    if (!this.expireTime) {
      return true
    }

    // Refresh if we are within 5 minutes of expiration
    return moment.utc(this.expireTime).diff(moment.utc()) < FIVE_MINUTES
  }

  set expired (_value) {
    // not mutable
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

  async refreshPromised (isInner) {
    try {
      this.failedOn = "credentials"

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
      if (isInner !== true) {
        this.logger.error(`Failed first attempt at resolving credentials (Failure in ${this.failedOn}). Trying again...\n${error}`)

        // Intentional cascade in the following switch
        switch (this.failedOn) {
          case 'client':
            await this.deleteClient()
          case 'access':
            await this.deleteAccess()
          case 'credentials':
            await this.deleteCredentials()
        }
        await this.refreshPromised(true)
      } else {
        if (this.verbose) {
          this.logger.error('SSO: Failed to resolve credentials:', error)
        } else {
          this.logger.error(`SSO: Failed to resolve credentials: ${error}`)
        }

        throw error
      }
    } finally {
      this.failedOn = null
    }
  }

  async getTemporaryCredentials () {
    if (this.config == null) {
      this.config = await this.fetchConfig()
    }

    let credentials = await this.fetchCredentials()

    if (credentials == null) {
      this.failedOn = "access"

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

      credentials = {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        expiresAt
      }

      this.logger.verbose('Persisting temporary credentials ...')
      await this.persistCredentials(credentials)
    }

    return credentials
  }

  async getAccess () {
    let access = await this.fetchAccess()

    if (access == null) {
      this.failedOn = "client"

      const { startUrl } = this.config
      const oidc = new aws.SSOOIDC()

      this.logger.warn('Time to refresh access info.')
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

      this.logger.warn('Starting client authorzation (opening browser) ...')
      let startAuthResult
      try {
        startAuthResult = await promised(h => oidc.startDeviceAuthorization(params, h))
      } catch (error) {
        console.error(`Error: ${error}`)
        throw error
      }

      const {
        deviceCode,
        userCode,
        verificationUriComplete,
        interval: minPollIntervalSeconds
      } = startAuthResult

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

          this.logger.warn('Token created.')

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
          if (this.verbose) {
            this.logger.error(`Failed to create token: ${error}`, error)
          }
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
      this.logger.warn('Registering client ...')
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
      this.logger.warn('Client registered.')

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
    this.logger.verbose(`Persisting client info to ${this.clientFile} ...`)
    await promised(h => fs.mkdir(clientDir, { recursive: true }, h))
    await promised(h => fs.writeFile(this.clientFile, JSON.stringify(client), h))
  }

  async persistAccess (access) {
    this.logger.verbose(`Persisting access data to ${this.accessFile} ...`)
    await promised(h => fs.writeFile(this.accessFile, JSON.stringify(access), h))
  }

  async persistCredentials (credentials) {
    this.logger.verbose(`Persisting temporary credentials to ${this.credentialsFile} ...`)
    await promised(h => fs.writeFile(this.credentialsFile, JSON.stringify(credentials), h))
  }

  async fetchClient () {
    try {
      this.logger.verbose(`Fetching client info from ${this.clientFile} ...`)
      const raw = await promised(h => fs.readFile(this.clientFile, 'utf-8', h))
      const record = JSON.parse(raw)

      if (moment.utc(record.expiresAt).diff(moment.utc()) < FIVE_MINUTES) {
        this.logger.warn(`Client registration record expired (expired at ${moment.utc(record.expiresAt).toISOString()}).`)
        return null
      } else {
        this.logger.verbose(`'Client registration record found (expires at ${moment.utc(record.expiresAt).toISOString()}).'`)
        return record
      }
    } catch (error) {
      this.logger.verbose(`No client registration record found. ${error}`)
      return null
    }
  }

  async fetchAccess () {
    try {
      this.logger.verbose(`Fetching access data from ${this.accessFile} ...`)

      const raw = await promised(h => fs.readFile(this.accessFile, 'utf-8', h))
      const record = JSON.parse(raw)

      if (moment.utc(record.expiresAt).diff(moment.utc()) < FIVE_MINUTES) {
        this.logger.verbose(`Cached access info expired (expired at ${moment.utc(record.expiresAt).toISOString()}).`)
        return null
      } else {
        this.logger.verbose(`Cached access info found (expires at ${moment.utc(record.expiresAt).toISOString()}).`)
        return record
      }
    } catch (error) {
      this.logger.verbose(`No client access info cached. ${error}`)
      return null
    }
  }

  async fetchCredentials () {
    try {
      this.logger.verbose(`Fetching credentials from ${this.credentialsFile} ...`)
      const raw = await promised(h => fs.readFile(this.credentialsFile, 'utf-8', h))
      const record = JSON.parse(raw)

      if (moment.utc(record.expiresAt).diff(moment.utc()) < FIVE_MINUTES) {
        this.logger.verbose(`Cached credentials expired (expired at ${moment.utc(record.expiresAt).toISOString()}).`)
        return null
      } else {
        this.logger.verbose(`Cached credentials found (expires at ${moment.utc(record.expiresAt).toISOString()}).`)
        return record
      }
    } catch (error) {
      this.logger.verbose(`No client credentials cached. Could not fetch. ${error}`)
      return null
    }
  }

  async deleteClient () {
    try {
      this.logger.verbose('Deleting client record ...')
      await promised(h => fs.unlink(this.clientFile, h))
      logger.verbose('Client record has been deleted.')
    } catch (error) {
      logger.verbose(`No client record. Could not delete. ${error}`)
    }
  }

  async deleteAccess () {
    try {
      this.logger.verbose('Deleting access record ...')
      await promised(h => fs.unlink(this.accessFile, h))
      logger.verbose('Access record has been deleted.')
    } catch (error) {
      logger.verbose(`No access record. Could not delete. ${error}`)
    }
  }

  async deleteCredentials () {
    try {
      this.logger.verbose('Deleting credentials record ...')
      await promised(h => fs.unlink(this.credentialsFile, h))
      logger.verbose('Credentials record has been deleted.')
    } catch (error) {
      logger.verbose(`No credentials record. Could not delete. ${error}`)
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

      this.logger.verbose(`profile[${this.profile}] => ${buzJson(profile)}`)

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

function numeric (value) {
  const num = Number(value)

  if (!isNaN(num)) {
    return num
  }
}
