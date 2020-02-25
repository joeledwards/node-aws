const s3 = require('./s3')
const aws = require('./aws')
const ec2 = require('./ec2')
const ses = require('./ses')
const sqs = require('./sqs')
const athena = require('./athena')
const lambda = require('./lambda')
const dynamodb = require('./dynamodb')
const stepFunctions = require('./step-functions')
const cloudwatchEvents = require('./cloudwatch-events')

module.exports = {
  athena,
  cloudwatchEvents,
  dynamodb,
  ec2,
  lambda,
  s3,
  ses,
  sqs,
  stepFunctions,
  sdk: aws.sdk
}
