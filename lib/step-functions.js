module.exports = require('mem')(newStepFunctions)

const aws = require('./aws')
const promised = require('@buzuli/promised')

function newStepFunctions ({ config } = {}) {
  const sdk = new aws.sdk.StepFunctions(config)

  return {
    activities: activities.bind(null, sdk),
    createStateMachine: createStateMachine.bind(null, sdk),
    deleteStateMachine: deleteStateMachine.bind(null, sdk),
    execute: execute.bind(null, sdk),
    executions: executions.bind(null, sdk),
    getExecution: getExecution.bind(null, sdk),
    getStateMachine: getStateMachine.bind(null, sdk),
    stateMachines: stateMachines.bind(null, sdk),
    stopExecution: stopExecution.bind(null, sdk),
    updateStateMachine: updateStateMachine.bind(null, sdk),
    sdk
  }
}

async function activities (sdk, options = {}) {
  return promised(h => sdk.listActivities(options, h))
}

async function createStateMachine (sdk, options) {
  return promised(h => sdk.createStateMachine(options, h))
}

async function deleteStateMachine (sdk, options) {
  return promised(h => sdk.deleteStateMachine(options, h))
}

async function execute (sdk, arn, name, input) {
  return promised(h => sdk.startExecution({ stateMachineArn: arn, name, input }, h))
}

async function executions (sdk, options = {}) {
  return promised(h => sdk.listExecutions(options, h))
}

async function getExecution (sdk, arn) {
  return promised(h => sdk.getExecutionHistory({ executionArn: arn }, h))
}

async function getStateMachine (sdk, arn) {
  return promised(h => sdk.describeStateMachine({ stateMachineArn: arn }, h))
}

async function stateMachines (sdk, options = {}) {
  return promised(h => sdk.listStateMachines(options, h))
}

async function stopExecution (sdk, arn, { cause, error } = {}) {
  const options = { executionArn: arn }

  if (error) {
    options.error = error
  }

  if (cause) {
    options.cause = cause
  }

  return promised(h => sdk.stopExecution(options, h))
}

async function updateStateMachine (sdk, options) {
  return promised(h => sdk.updateStateMachine(options, h))
}
