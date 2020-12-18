const s3 = require('./s3')
const ec2 = require('./ec2')
const ses = require('./ses')
const sqs = require('./sqs')
const auth = require('./auth')
const util = require('./util')
const athena = require('./athena')
const lambda = require('./lambda')
const dynamodb = require('./dynamodb')
const stepFunctions = require('./step-functions')
const cloudwatchEvents = require('./cloudwatch-events')

const {
  sdk,
  resolveSdk,
  configureSdk
} = require('./aws')

const services = {
  athena,
  auth,
  cloudwatchEvents,
  dynamodb,
  ec2,
  lambda,
  s3,
  ses,
  sqs,
  stepFunctions
}

module.exports = {
  sdk,
  resolve: async (options = {}) => {
    const sdk = await resolveSdk(options)
    return { sdk, ...services }
  },
  configure: config => {
    const sdk = configureSdk(config)
    return { sdk, ...services }
  },
  util,
  ...services
}
