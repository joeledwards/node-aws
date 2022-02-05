
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

  error (...args) {
    if (typeof this._logger.error === 'function') {
      this._logger.error(...args)
    } else {
      this._logger.info(...args)
    }
  }

  warn (...args) {
    if (typeof this._logger.warn === 'function') {
      this._logger.warn(...args)
    } else {
      this._logger.error(...args)
    }
  }

  info (...args) {
    if (!this._quiet) {
      this._logger.info(...args)
    }
  }

  verbose (...args) {
    if (this._verbose && !this._quiet) {
      if (typeof this._logger.verbose === 'function') {
        this._logger.verbose(...args)
      } else {
        this._logger.info(...args)
      }
    }
  }
}

module.exports = Logger

