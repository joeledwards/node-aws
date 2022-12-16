# @buzuli/aws

Wraps [aws-sdk](https://npmjs.com/package/aws-sdk) and provides some utilities for simplifying common actions.
Also attempts to simplify credential resolution.

## Install

```
$ npm i @buzuli/aws
```

## Import

```
const aws = require('@buzuli/aws')
```

### Default aws-sdk credential resolution

```
const { sdk } = aws
```

### Custom configuration

```
const { sdk } = aws.configure({ credentials, region })
```

### Resolve credential chain asynchronously (supports SSO)

Requires the following fields in the identified profile
- `sso_region`: `string` | Name of the AWS region (e.g., `us-east-1`)
- `sso_account_id`: `integer` | AWS account number (e.g., `123456789000`)
- `sso_role_name`: `string` | The role to assume on successful authentication.
- `sso_start_url`: `url` | The start URL of the OIDC identity service.

If you are using profiles in `~/.aws/config`, you may need to export 
`AWS_SDK_LOAD_CONFIG` with a truthy value in your shell.

```
const { sdk } = await aws.resolve({ profile, timeout })
```

## Table of Contents
- [aws](#aws)
  - [awsConfig](#awsconfig)
  - [configure()](#awsconfigure)
  - [resolve()](#awsresolve)
  - [sdk](#awssdk)
  - [util](#awsutil)
  - [athena](#awsathena)
    - [sdk](#athenasdk)
    - [cancelQuery()](#athenacancelquery)
    - [listQueries()](#athenalistqueries)
    - [loadQuery()](#athenaloadquery)
    - [queryDone()](#athenaquerydone)
    - [queryResults()](#athenaqueryresults)
    - [queryStatus()](#athenaquerystatus)
    - [runQuery()](#athenarunquery)
    - [scanQueries()](#athenascanqueries)
    - [startQuery()](#athenastartquery)
  - [cloudwatchEvents](#awscloudwatchevents)
    - [sdk](#cloudwatcheventssdk)
    - [updateRule()](#cloudwatcheventsupdaterule)
  - [dynamodb](#awsdynamodb)
    - [sdk](#dynamodbsdk)
    - [batchGet()](#dynamodbbatchget)
    - [batchPut()](#dynamodbbatchput)
  - [ec2](#awsec2)
    - [sdk](#ec2sdk)
    - [run()](#ec2run)
  - [lambda](#awslambda)
    - [sdk](#lambdasdk)
    - [create()](#lambdacreate)
    - [get()](#lambdaget)
    - [invoke()](#lambdainvoke)
    - [list()](#lambdalist)
    - [tag()](#lambdatag)
    - [tags()](#lambdatags)
    - [untag()](#lambdauntag)
    - [updateCode()](#lambdaupdatecode)
    - [updateConfig()](#lambdaupdateconfig)
    - [updateConcurrency()](#lambdaupdateconocurrency)
  - [s3](#awss3)
    - [sdk](#s3sdk)
    - [buckets()](#s3buckets)
    - [get()](#s3get)
    - [getKeys()](#s3getkeys)
    - [getPrefixes()](#s3getprefixes)
    - [head()](#s3head)
    - [put()](#s3put)
    - [scanKeys()](#s3scankeys)
    - [scanLog()](#s3scanlog)
    - [scanLogs()](#s3scanlogs)
    - [scanMpu()](#s3scanmpu)
    - [select()](#s3select)
    - [stream()](#s3stream)
    - [transform()](#s3transform)
    - [upload()](#s3upload)
    - [whenExists()](#s3whenexists)
  - [ses](#awsses)
    - [sdk](#sessdk)
    - [send()](#sessend)
  - [sqs](#awssqs)
    - [sdk](#sqssdk)
    - [ack()](#sqsack)
    - [peek()](#sqspeek)
    - [queues()](#sqsqueues)
    - [send()](#sqssend)
  - [stepFunctions](#awsstepfunctions)
    - [sdk](#stepfunctionssdk)
    - [activities()](#stepfunctionsactivities)
    - [createStateMachine()](#stepfunctionscreatestatemachine)
    - [deleteStateMachine()](#stepfunctionsdeletestatemachine)
    - [execute()](#stepfunctionsexecute)
    - [executions()](#stepfunctionsexecutions)
    - [getExecution()](#stepfunctionsgetexecution)
    - [getStateMachine()](#stepfunctionsgetstatemachine)
    - [stateMachines()](#stepfunctionsstatemachines)
    - [stopExecution()](#stepfunctionsstopexecution)
    - [updateStateMachine()](#stepfunctionsupdatestatemachine)

## aws

### awsConfig

The configuration format for AWS SDK components.

If this is missing for any SDK setup function (e.g., aws.s3()), it will pull from the default provider chain.

- `region` | The AWS region (e.g., us-west-2).
- `credentials` | A Credentials implementation or an object containing the following.
- `credentials.accessKeyId` | The auth key identity
- `credentials.secretAccessKey` | The auth key secret
- `credentials.sessionToken` | The session token (if available)

### aws.configure

Configures the SDK with custom credentials and region.

`aws.configure(config)`
- [config](#awsconfig)

Returns an object containing the base SDK and all supported service utilities:
```
{
  sdk,
  ...services
}
```

### aws.resolve

Attempts to resolve the credentials chain, starting with SSO credentials.

`aws.resolve({ config, logger, profile, quiet, timeout, verbose }?)`
- `config`: `object` | Custom config to use instead of loading from disk. 
- `logger`: `object` = `console` | Custom logger object.
- `profile`: `string` = `default` | Profile to load for SSO. Overrides value of the `BUZULI_AWS_PROFILE` environment variable.
- `quiet`: `boolean` = `false` | Only log warning and error messages. Overrides value of the `BUZULI_AWS_QUIET` environment variable.
- `timeout`: `number` = 120 | Maximum number of seconds to wait for SSO auth to complete. Overrides value of the `BUZULI_AWS_QUIET` environment variable.
- `verbose`: `boolean` = `false` | Log verbose messages. Overrides value of the `BUZULI_AWS_VERBOSE` environment variable.

Returns a Promise which, on success, returns an object containing the base SDK and all supported service utilities:
```
{
  sdk,
  ...services
}
```

You can configure some of the parameters to `resolve()` via environment variables. Hoever, the parameters take precedence over the environment variables if supplied.
- `BUZULI_AWS_PROFILE` => `profile`
- `BUZULI_AWS_QUIET` => `quiet`
- `BUZULI_AWS_TIMEOUT` => `timeout`
- `BUZULI_AWS_VERBOSE` => `verbose`

### aws.sdk

The [AWS JavaScript SDK](https://npmjs.com/package/aws-sdk).

### aws.util

Miscellaneous utilities.

- `s3.formatUri(bucket: string, key: string, options: object) -> uri`
  - `options.color: boolean = false`
- `s3.parseUri(uri: string) -> { bucket: string, key: string }`

### aws.athena

Interact with AWS Athena.

`aws.athena({ config, s3Config }?)`
- [config](#awsconfig)
- [s3Config](#awsconfig)

Returns the AWS Athena utilities, exposing the resources below.

#### athena.sdk

The raw SDK, inititalized with the supplied configuration.

#### athena.cancelQuery

Cancels an Athena query.

`athena.cancelQuery(queryId)`
- `queryrId`: `string` | The ID of the query to cancel.

Returns a promise which indicates the outcome of the query cancellation.

#### athena.listQueries

List Athena queries.

`athena.listQueries()`

Returns a promis which, on success, supplies a list of Athena queries.

#### athena.loadQuery

Load an Athena query from a file, optionally applying substitutions.

`athena.loadQuery(fileName, substitutions)`
- `fileName`: `string` | The name of the file from which the query should be loaded.
- `substitutions`: `object` | Mapping of names to values for parameterized queries containing `{{<substitution-field-name>}}`.

Returns a promise which will supply the query string on success.

#### athena.queryDone

Poll a query until completion or timeout.

`athena.queryDone(queryId, options)`
- `queryId`: `string` | The ID of the query to await.
- `options.timeout`: `number` = `600000` | The maximum number of milliseconds to wait for the query to complete before reporting failure.
- `options.pollInterval`: `number` = `5000` | The number of milliseconds to delay between poll attempts.
- `options.progress`: `boolean` = `true` | Whether to report query progress on each poll event.

Returns a promise which indicates the outcome of the query.

On completion resolves with `{ queryId, duration, bytesScanned, state, timedOut, success }`:
- `queryId`: `string` | The ID of the query.
- `bytesScanned`: `number` | The number of bytes read by the query.
- `state`: `string` | The outcome state of the query.
- `timedOut`: `boolean` | Indicates whether the query timed out.
- `success`: `boolean` | Indicates whether the query succeeded.
- `durations`: `object` | The durations metrics for each part of the query.
- `durations.queue`: `number` | The time (in seconds) that the query spent queued.
- `durations.plan`: `number` | The time (in seconds) taken to plan the query after it left the queue.
- `durations.exec`: `number` | The time (in seconds) taken to execute the query after planning completed.
- `durations.publish`: `number` | The time (in seconds) taken to publish results after the query finished executing.
- `durations.total`: `number` | The total amount of time Athena took to process the query.

#### athena.queryResults

Fetch the results (or a sample of the results) from a query.

`athena.queryResults(queryId, options)`
- `queryId`: `string` | The ID of the query for which results should be retrieved.
- `options.sampleSize`: `number` = `1024` | The maximum number of bytes to fetch (0 to skip the sample; negative value to fetch everything).

Returns a promise which will contain the sample/full query results.

#### athena.queryStatus

Determine the status of a query.

`athena.queryStatus(queryId)`
- `queryId`: `string` | The ID of the query to evaluate.

Returns a promise which will contain the query status if the query was found.

- `query`: `Query` | The query text.
- `workGroup`: `string` | The Athena workgroup in which the query ran.
- `queryId`: `string` | The ID of the query to evaluate.
- `queryType`: `string` | the type of query (DDL | DML).
- `schema`: `string` | the schema containing the query resources.
- `bytesScanned`: `integer` | The number ob bytes read by the query.
- `durations`: `float` | The duration of the query in seconds (floating point value; see `durations` from [queryDone()]($athenaquerydone)).
- `submittedAt`: `timestamp` | The submission time of the query.
- `completedAt`: `timestamp` | The completion time of the query (if applicable).
- `finished`: `boolean` | Indicates whether the query finished.
- `state`: `string` | The outcome state of the query.
- `stateReason`: `string` | The reason for the state transition.
- `manifestLocation`: `string` | The query manifest file location.
- `outputLocation`: `object` | The location of the query results on S3 (see `outputLocation` from [startQuery()](#athenastartquery)).

#### athena.runQuery

Run a query and wait for it to complete optionally 

`athena.runQuery(options)`
- `options.query`: `string` [required] | The query (DDL or SQL) to run.
- `options.queryTag`: `string` | A supplimental identifier which will be included in the query token.
- `options.workGroup`: `string` | The Athena workgroup where the query should be run (uses the default if none is supplied).
- `options.catalog`: `string` | The catalog which Athena should use (uses AWS Glue if none is supplied).
- `options.databases`: `string` | The database in which Athena should find tables names which have no database prefix.
- `options.resultBucket`: `string` | The S3 bucket where query results should be written.
- `options.resultPrefix`: `string` | The prefix to append to query result S3 keys.
- `options.timeout`: `number` = `600000` | The maximum number of milliseconds to wait for the query to complete before reporting failure.
- `options.pollInterval`: `number` = `5000` | The number of milliseconds to delay between poll attempts.
- `options.progress`: `boolean` = `false` | Whether to report query progress on each poll event.

Returns a promise which will resolve on query completion with a summary of the query.

On completion resolves with `{ queryId, result, duration, bytesScanned, token, success, timedOut }`
- `queryId`: `string` | The ID of the query.
- `durations`: `float` | The duration of the query in seconds (floating point value; see `durations` from [queryDone()]($athenaquerydone)).
- `bytesScanned`: `number` | The number of bytes read by the query.
- `token`: `string` | The query token.
- `state`: `string` | The outcome state of the query.
- `success`: `boolean` | Indicates whether the query succeeded.
- `timedOut`: `boolean` | Indicates whether the query timed out.
- `outputLocation`: `object` | The location of the query results on S3 (see `outputLocation` from [startQuery()](#athenastartquery)).

#### athena.startQuery

Start a new Athena query (DDL or SQL).

`athena.startQuery(options)`
- `options.query`: `string` [required] | The query (DDL or SQL) to run.
- `options.token`: `string` | A token for the query (must be unique within Athena for this AWS account).
- `options.workGroup`: `string` | The Athena workgroup where the query should be run (uses the default if none is supplied).
- `options.catalog`: `string` | The catalog which Athena should use (uses AWS Glue if none is supplied).
- `options.databases`: `string` | The database in which Athena should find tables names which have no database prefix.
- `options.resultBucket`: `string` | The S3 bucket where query results should be written.
- `options.resultPrefix`: `string` | The prefix to append to query result S3 keys.

Returns a promise which will resolve with query details if the query starts successfully.

On completion resolves with `{ queryId, resultLocation }`
- `queryId`: `string` | The ID of the query.
- `outputLocation`: `object` | The location of the query results on S3 (will be written when the query completes successfully).
  - `outputLocation.bucket` : `string` | The bucket where the results will be written.
  - `outputLocation.key` : `string` | The key which will contain the results CSV.
  - `outputLocation.url` : `string` | The location of the results CSV in URL form.

#### athena.scanQueries

Scan Athena queries.

`athena.scanQueries()`

Returns an async iterator listing Athena queries.

### aws.cloudwatchEvents

Interact with AWS CloudWatch Events.

`aws.cloudwatchEvents({ config })`
- [config](#awsconfig)

Returns the AWS CloudWatch Events utilities, exposing the resources below.

#### cloudwatchEvents.sdk

The raw SDK, initialized with the supplied configuration.

#### cloudwatchEvents.updateRule

Update (patch) a rule. This fetches the existing configuration, patches it with the supplied `options`, and performs a put against the API to replace the rule's definition.

`cloudwatchEvents.updateRule(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchEvents.html#putRule-property)

Returns a Promise which will be resolved with the outcome on completion.

### aws.dynamodb

Interact with AWS DynamoDB.

`aws.dynamodb({ config })`
- [config](#awsconfig)

Returns the AWS DynamoDB utilities, exposing the resources below.

#### dynamodb.sdk

The raw SDK, initialized with the supplied configuration.

#### dynamodb.batchGet

Fetch multiple entries from a DynamoDB table.

`dynamodb.batchGet(table, entries, attributes)`
- `table`: `string` | The table from which to fetch entries.
- `entries`: `[object]` | The entries to fetch from the table (supply partition and sort keys).
- `attributes`: `[string]` | The attributes (columns) to fetch.

Returns a Promise which will be resolved with the outcome (may include unprocessed records) on success.

#### dynamodb.batchPut

Write multiple entries to a DynamoDB table.

`dynamodb.batchPut(table, entries)`
- `table`: `string` | The table to which entries should be written.
- `entries`: `[object]` | The entries to write to the table (supply partition and sort keys plus any extra data values desired).

Returns a Promise which will be resolved with the matching records on success.

### aws.ec2

Interact with AWS EC2.

`aws.ec2({ config })`
- [config](#awsconfig)

Returns the AWS EC2 utilities, exposing the resources below.

#### ec2.sdk

The raw SDK, initialized with the supplied configuration.

#### ec2.run
`ec2.run(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/EC2.html#runInstances-property)

### aws.lambda

Interact with AWS Lambda.

`aws.lambda({ config })`
- [config](#awsconfig)

Returns the AWS Lambda utilities, exposing the resources below.

#### lambda.sdk

The raw SDK, inititalized with the supplied configuration.

#### lambda.create

Create a lambda function.

`lambda.create(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#createFunction-property)

Returns a promise indicating the result of the creation operation.

#### lambda.get

Fetch a lambda by name.

`lambda.get(name)`
- `name`: `string` | The name of the Lambda to fetch.

Return a promise which will contain the Lambda function's details on success.

#### lambda.invoke

Invoke a lambda.

`lambda.invoke(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#invoke-property)

Returns a promise indicating the outcome.

#### lambda.list

List the Lambdas for this account.

`lambda.list(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#listFunctions-property)

#### lambda.tag

Apply tags to a Lambda.

`lambda.tag(arn, tags)`
- `arn`: `string` | The arn identifying the lambda to which tags should be added.
- `tags`: `object` | An object mapping tag names to values.

Returns a promise indicating the outcome.

#### lambda.tags

Fetch a list of tags for the identified lambda.

`lambda.tags(arn)`
- `arn`: `string` | The arn of the Lambda from which tags should be fetched.

Returns a promise which will supply an array of tags on success.

#### lambda.untag

Remove tags from a Lambda.

`lambda.untag(arn, tagNames)`
- `arn`: `string` | The arn identifying the lambda from which tags should be removed.
- `tagNames`: `object` | An array of tag names to remove.

Returns a promise indicating the outcome.

#### lambda.updateCode

Update the code associated with a Lambda.

`lambda.updateCode(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#updateFunctionCode-property)

Returns a promise indicating the outcome.

#### lambda.updateConfig

Update a Lambda's configuration.

`lambda.updateConfig(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#updateFunctionConfiguration-property)

Returns a promise indicating the outcome.

#### lambda.updateConcurrency

Update a Lambda's execution concurrency (maximum simultaneously executing instances).

`lambda.updateConcurrency(name, concurrency)`
- `name`: `string` | The name of the lambda to update.
- `concurrency`: `number` | The new concurrency level for the Lambda.

Returns a promise indicating the outcome.

### aws.ses

Interact with AWS SES.

`aws.ses({ config })`
- [config](#awsconfig)

#### ses.sdk

The raw SDK, inititalized with the supplied configuration.

#### ses.send

`ses.send(sender, options)`
- `sender` : `string` | The sender e-mail address (must be a verified e-mail address within SES).
- `options.to`: `Array[string]` | The e-mail addresse(s) of the primary recipient(s).
- `options.cc`: `Array[string]` | The e-mail addresse(s) of secondary (carbon-copied) recipient(s).
- `options.bcc`: `Array[string]` | The e-mail addresse(s) of the secret (blind carbon-copied) recipient(s).
- `options.reply`: `Array[string]` | The e-mail addresse(s) to which replies should be sent.
- `options.subject`: `string` | The subject of the e-mail.
- `options.text`: `string` | Text body of the e-mail.
- `options.html`: `string` | HTML body of the e-mail (allows advanced formatting).
- `options.attachments`: `Array[object]` | These are [nodemailer attachments](https://nodemailer.com/extras/mailcomposer/#attachments).

Returns a Promise which will supply an object containing the `MessageId` on success.

### aws.sqs

Interact with AWS SQS.

`aws.sqs({ config })`
- [config](#awsconfig)

#### sqs.sdk

The raw SDK, inititalized with the supplied configuration.

#### sqs.ack

Acknowledges (deletes) a message from an SQS queue.

`sqs.ack(queue, message)`
- `queue`: `string` | The URL of the queue from which the message was retrieved.
- `message`: `object` | The message object (must contain the `ReceiptHandle` field).

#### sqs.messageCounts

Fetch estimated counts on messages in various states in the queue.

`sqs.messageCounts(queue)`
- `queue`: `string` | The URL of the queue from which the message was retrieved.

Returns a Promise which contains an object on success.

`{ available, delayed, inFlight, total }`
- `available`: `number` | The number of messages which can be read immediately.
- `delayed`: `number` | The number of messages which are not yet available due to the delivery delay setting on the queue.
- `inFlight`: `number` | The number of messages which have been read, and are awaiting ack or re-queue timeout.
- `total`: `number` | The total number of messages in the queue (all states).

#### sqs.peek

Fetches a sample of messages from the queue.

`sqs.peek(queue, options)`
- `queue`: `string` | The URL of the queue from which the message was retrieved.
- `options.limit`: `number` = `1` | The maximum number of messages to retrieve (max is 10).
- `options.maxWait`: `number` | The maximum number of seconds to wait for up to `limit` messages (max is 15).
- `options.requeueDelay`: `number` | The number of seconds before received messages are once again available for receipt (max is 900).

Returns a Promise which contains a list of messages on success.

#### sqs.queues

Lists the SQS queues associated with this account.

`sqs.queues()`

Returns a Promise which contains the list of queues on success.

#### sqs.send

Sends a message to an SQS queue.

`sqs.send(queue, message, options)`
- `queue`: `string` | The URL of the queue to which the message will be sent.
- `message`: `string` | The message text.
- `options.delay`: `number` | The number of seconds the message should be delayed before the queue will deliver it to a consumer.
- `options.id`: `string` | A unique identifier used to deduplicate messages delivered within the same 5-minute window.
- `options.groupId`: `string` | For FIFO queues only. A uniqueue identifier for the message group, indicating the FIFO too which the message belongs within the queue.

Returns a Promise which which contains the message details on success.

### aws.s3

Interact with AWS S3.

`aws.s3({ config })`
- [config](#awsconfig)

Returns the AWS S3 utilities, exposing the resources below.

#### s3.sdk

The raw SDK, inititalized with the supplied configuration.

#### s3.buckets

Fetch a list of the S3 buckets owned by this account.

`s3.buckets()`

Returns a promise which, on success, will contain a list of buckets:

`Array<{ bucket, created }>`
- `bucket`: `String` | The name of the bucket.
- `created`: `Date` | The bucket creation timestamp.

#### s3.get

Fetch an object from S3.

`s3.get(bucket, key, options)`
- `bucket`: `string` | The S3 bucket from which to fetch the object.
- `key`: `string` | The S3 key identifying the object to fetch.
- `options.maxBytes`: `number` = `0` | The maximum number of bytes to return (if maxBytes > 0).

Returns a promise which will contain the result on success.

#### s3.getKeys

Lists the keys in the named S3 bucket which have the specified prefix.

`s3.getKeys(bucket, prefix, options)`
- `bucket`: `string` | The bucket from which to list keys.
- `prefix`: `string` | The prefix to which listed keys should be limited.
- `options`: `object` | The `options` for the `scanKeys()` function, which this function uses to list keys.
- `options.logger`: `object` | A logger exposing the `info()` function used to report on progress if supplied.
- `options.progress`: `({count, total}) => nil` | A functhing to which progress reports are fed on a regular cadence while scanning keys.

Returns a promise which will be resolved with the list of keys on success.
The key struture matches that of the `key` event emitted by the [scanKeys()](#s3scankeys) function based on the supplied `options`.

#### s3.getPrefixes

Lists the key prefixes in the named S3 bucket which have the specified prefix.

`s3.getPrefixes(bucket, prefix, options)`
- `bucket`: `string` | The bucket from which to list prefixes.
- `prefix`: `string` | The prefix to which listed prefixes should be limited.
- `options.delimiter`: `string` = `/` | The delimiter which should be used to split prefixes (default is `/`).

Returns a promise which, on success, will supply an array of `string` prefixes.

#### s3.head

Fetch only the metadata associated with an S3 object.

`s3.head(bucket, key)`
- `bucket`: `string` | The bucket in which the object resides.
- `key`: `string` | The key of the object for which metadata should be fetched.

Returns a promise which will be resolved with the object metadata on success.

#### s3.put

Put an object to an S3 bucket.

`s3.put(bucket, key, payload, options)`
- `bucket`: `string` | The bucket to which the object should be written.
- `key`: `string` | The key where the object should be stored.
- `payload`: `string | Buffer | ReadableStream` | The content which should be stored to S3.
- `options.contentType`: `string` | The content-type of the payload.
- `options.contentEncoding`: `string` | The content-encoding of the payload.
- `options.metadata`: `object` | Metadata fields to add to the record
- `options.publish`: `boolean` = `false` | Indicates whether the object should be made publicly readable.

#### s3.scanKeys

Supplies an async generator which yields each key as it is scanned from the S3 bucket.

`s3.scanKeys(bucket, prefix, options)`
- `bucket`: `string` | The bucket from which to list keys.
- `prefix`: `string` | The prefix to which listed keys should be limited.
- `options.limit`: `number` | The maximum number of keys to retrieve.
- `options.delimiter`: `string` | The delimiter which should be used to group keys.
- `options.includeMetadata`: `boolen` = `false` | Indicates whether each key should be supplied as an metadata-rich object instead of just they key name (string).

Returns an async generator.

If `includeMetadata = false`, each generated key is a `string` which is the key name. Otherwise each generated key is an object: `{etag, key, size, timestamp}`.

#### s3.scanLog

Scans the contents of an S3 object, gzip decompressing if possible, splitting on newlines, and handing each line to the supplied `scanner` function.

`s3.scanLog(bucket, key, scanner)`
- `bucket`: `string` | The bucket from which to stream the object.
- `key`: `string` | The key identifying the object to stream.
- `scanner`: `(line: string) => nil` | The handler function which will be called with every line scanned from the log object.

Returns a promise which will resolve on completion of the scan or reject if there was an error with the stream or an unhandled error thrown by the `scanner` function.

#### s3.scanLogs

Runs [scanLog()](#s3scanlog) against every key in the named bucket with the specified prefix.

`s3.scanLogs(bucket, prefix, scanner, options)`
- `bucket`: `string` | The bucket from which to stream objects.
- `prefix`: `string` | The prefix identifying the objects to stream.
- `scanner`: `({ line: string, key: string }) => nil` | The handler function which will be called with every line scanned from matching log objects.
- `options.keyFilter`: `(key) => boolean` | An optional key filter which must return a truthy value for those keys which should be retained.

Returns a promise which will resolve on completion of the scan or reject if there was an error with any of the streams or an unhandled error thrown by the `scanner` function.

#### s3.scanMpu

Supplies an async generator which yields incomplete, multi-part uploads as they are scanned from the S3 bucket.

`s3.scanMpu(bucket, options)`
- `bucket`: `string` | The bucket from which to list uploads.
- `options.limit`: `number` | The maximum number of uploads to retrieve.

Returns an async generator.

Each generated upload is an object: `{bucket, key, initiated}`.

#### s3.select

Starts an S3 select query against an object, providing a stream of records which contain the identified columns from passing records.

`s3.select(bucket, key, query, progress)`
- `bucket`: `string` | The bucket where the object resides.
- `key`: `string` | The key identifying the object to query.
- `query`: `string` | The S3 Select query to run against the object.
- `progress`: `boolean` = `false` | Indicates whether `progress` events should be emitted by the supplied stream.

Returns a readable object stream which will supply each record returned by thge select query.

Addition events:
- `cont` | A multi-part object has continued scanning on the next part.
- `progress` | A progress record has been supplied.
- `stats` | A stats record has been supplied indicating the number of bytes: `{scanned, processed, returned}`.

#### s3.stream

Supplies a raw, readable stream from an S3 object.

`s3.stream(bucket, key)`
- `bucket`: `string` | The bucket where the object resides.
- `key`: `string` | The key identifying the object to stream.

Returns a readable stream for the S3 object contents. Any error fetching the resource will be detailed in an `error` event.

#### s3.transform

Pipe the contents of one S3 object to a new location on S3, optionally transforming it on the way.

This utility is a bit opinionated, expecting newline-separated records. It will automatically handle gzipped data.

Each line (newline stripped) is handed to the `transformer` function.
- If the `transformer` function is not supplied, lines are forwarded unmodified.
- If the value returned by `transformer` is not a string, that line is discarded.
- If the `transformer` function throws an error, it will be re-thrown unless the `options.ignoreTransformErrors` is set to `true`.

`s3.transform(srcBucket, srcKey, dstBucket, dstKey, options)`
- `srcBucket`: `string` | The bucket containing the source object.
- `srcKey`: `string` | The key of the source object.
- `dstBucket`: `string` | The bucket to which the transformed object should be uploaded.
- `dstKey`: `string` | The key to which the transformed object should be written.
- `options.transformer`: `(string) => string` | The transformation function to appy to the record.
- `options.gzip`: `boolean` = `false` | Gzip-compress the transformed data.
- `options.contentType`: `string` | The Content-Type of the uploaded data (S3 default if not supplied).
- `options.publish`: `boolean` = `false` | Make the transformed resource public.
- `options.partSize`: `number` = `20971520` | The maximum size of each part (S3 multi-part upload buffering).
- `options.queueSize`: `number` = `1` | The queue size to use for upload.
- `options.ignoreTransformErrors`: `boolean` = `false` | The queue size to use for upload.

Returns a Promise which, on success, will contain a summary of the transform operation:

`{ total, transformed, discarded, errors }`
- `total`: `number` | The total number of records read.
- `transformed`: `number` | The number of records transformed/forwarded.
- `filtered`: `number` | The number of records filetered (received a non-string value from `transformer`).
- `errored`: `number` | The number of errors caught (only possible if `options.ignoreTransformErrors` = `true`).

The following should always hold true for completed transforms:

`total` === `transformed` + `filtered` + `errored`

#### s3.upload

Pipe the contents of a stream directly to a location on S3.

`s3.upload(bucket, key, stream, options)`
- `bucket`: `string` | The bucket to which the object should be uploaded.
- `key`: `string` | The key to which the object should be written.
- `stream`: `ReadableStream` | The content to pipe to S3.
- `options.contentType`: `string` | The Content-Type of the uploaded data (S3 default if not supplied).
- `options.contentEncoding`: `string` | The Content-Encoding of the uploaded data (S3 default if not supplied).
- `options.publish`: `boolean` = `false` | Make the transformed resource public.
- `options.partSize`: `number` = `20971520` | The maximum size of each part (S3 multi-part upload buffering).
- `options.queueSize`: `number` = `1` | The queue size to use for upload.

Returns a Promise which indicates the outcome of the upload attempt.

#### s3.whenExists

Waits for an S3 object to be created.

`s3.whenExists(bucket, key)`
- `bucket`: `string` | The bucket where the object resides.
- `key`: `string` | The key identifying the object to wait on.

Returns a promise which will resolve when the object exists.

The SDK has a built-in timeout which will need to be handled and `whenExists()` called again if you wish to wait longer.

### aws.stepFunctions

Interact with AWS Step Functions.

`aws.stepFunctions({ config })`
- [config](#awsconfig)

Returns the AWS Step Functions utilities, exposing the resources below.

#### stepFunctions.sdk

The raw SDK, inititalized with the supplied configuration.

#### stepFunctions.activities

List step function activities.

`stepFunctions.activities(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/StepFunctions.html#listActivities-property).

Returns a promise with the activites listing on success.

#### stepFunctions.createStateMachine

Creates a new state machine.

`stepFunctions.createStateMachine(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/StepFunctions.html#createStateMachine-property).

Returns a promise indicating whether creation succeeded.

#### stepFunctions.deleteStateMachine

Deletes a state machine.

`stepFunctions.deleteStateMachine(arn)`
- `arn`: `string` | The arn of the state machine to delete.

Returns a promise indicating whether deletion succeeded.

#### stepFunctions.execute

Execute a step function.

`stepFunctions.execute(arn, name, input)`
- `arn`: `string` | The arn of the step function to execute.
- `name`: `string` | The unique name of the function to execute (may be repeated after 90 days).
- `input`: `string` | The input to the step function (pass customized execution parameters here).

Returns a promise indicating whether the execution succeeded.

#### stepFunctions.executions

List step function executions.

`stepFunctions.executions(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/StepFunctions.html#listExecutions-property).

Returns a promise with the executions listing on success.

#### stepFunctions.getExecution

Shows the state of a step function as a list of events.

`stepFunctions.getExecution(arn)`
- `arn`: `string` | The arn of the execution to fetch.

Returns the execution's events on success.

#### stepFunctions.getStateMachine

Shows the details of a state machine.

`stepFunctions.getStateMachine(arn)`
- `arn`: `string` | The arn of the state machine.

Returns the details of the state machine on success.

#### stepFunctions.stateMachines

List defined step function state machines.

`stepFunctions.stateMachines(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/StepFunctions.html#listStateMachines-property).

Returns a promise with the state machines listing on success.

#### stepFunctions.stopExecution

Stop an execution of a step function.

`stepFunctions.stopExecution(arn, options)`
- `arn`: `string` | The arn of the execution to stop.
- `options.error`: `string` | The error code indicating the reason for stopping execution.
- `options.cause`: `string` | A more detailed description of the reason for stopping execution.

Returns a promise indicating the outcome of the operation.

#### stepFunctions.updateStateMachine

Updates an existing state machine.

`stepFunctions.updateStateMachine(options)`
- `options`: `object` | The [AWS options](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/StepFunctions.html#updateStateMachine-property).

Returns a promise indicating whether update succeeded.

