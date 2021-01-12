# AWS SSO via OIDC

Use a temporary token from AWS SSO OIDC service.

## The process

1) Register the client
[OIDC RegisterClient](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_RegisterClient.html)
[aws-sdk.ssooidc.registerClient()](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SSOOIDC.html#registerClient-property)

2) Initiate the client authorization process
[OIDC StartDeviceAuthorization](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_StartDeviceAuthorization.html)
[aws-sdk.ssooidc.startDeviceAuthorization()](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SSOOIDC.html#startDeviceAuthorization-property)

3) Create the token once authorization has completed
[OIDC CreateToken](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/API_CreateToken.html)
[aws-sdk.ssooidc.createToken()](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/SSOOIDC.html#createToken-property)

## SSO config and token cache

1. register a client if it isn't cached
2. initialize authorization if there is no valid token present
3. create and cache a token

