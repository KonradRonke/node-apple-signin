const { URL } = require('url');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const NodeRSA = require('node-rsa');
const request = require('request-promise-native');

const ENDPOINT_URL = 'https://appleid.apple.com';
const DEFAULT_SCOPE = 'email';

const getAuthorizationUrl = (options = {}) => {
  if (!options.clientId) throw Error('client_id is empty');
  if (!options.redirectUri) throw Error('redirect_uri is empty');

  const url = new URL(ENDPOINT_URL);
  url.pathname = '/auth/authorize';

  url.searchParams.append('response_type', 'code');
  url.searchParams.append('state', options.state || 'state');
  url.searchParams.append('client_id', options.clientId);
  url.searchParams.append('redirect_uri', options.redirectUri);
  url.searchParams.append('scope', options.scope || DEFAULT_SCOPE);

  return url.toString();
};

const getClientSecret = (options) => {
  if (!options.clientId) throw Error('clientId is empty');
  if (!options.teamId) throw Error('teamId is empty');
  if (!options.keyIdentifier) throw Error('keyIdentifier is empty');
  if (!options.privateKeyPath) throw Error('privateKeyPath is empty');
  if (!fs.existsSync(options.privateKeyPath)) throw Error("Can't find private key");

  const timeNow = Math.floor(Date.now() / 1000);

  const claims = {
    iss: options.teamId,
    iat: timeNow,
    exp: timeNow + 15777000,
    aud: ENDPOINT_URL,
    sub: options.clientId,
  };

  const header = { alg: 'ES256', kid: options.keyIdentifier };
  const key = fs.readFileSync(options.privateKeyPath);

  return jwt.sign(claims, key, { algorithm: 'ES256', header });
};

const getAuthorizationToken = async (code, options) => {
  if (!options.clientId) throw Error('clientId is empty');
  if (!options.redirectUri) throw Error('redirectUri is empty');

  const url = new URL(ENDPOINT_URL);
  url.pathname = '/auth/token';

  const form = {
    client_id: options.clientId,
    client_secret: getClientSecret(options),
    code,
    grant_type: 'authorization_code',
    redirect_uri: options.redirectUri,
  };

  const body = await request({ url: url.toString(), method: 'POST', form });
  return JSON.parse(body);
};

const refreshAuthorizationToken = async (refreshToken, options) => {
  if (!options.clientId) throw Error('clientId is empty');

  const url = new URL(ENDPOINT_URL);
  url.pathname = '/auth/token';

  const form = {
    client_id: options.clientId,
    client_secret: getClientSecret(options),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };

  const body = await request({ url: url.toString(), method: 'POST', form });
  return JSON.parse(body);
};

const getApplePublicKey = async () => {
  const url = new URL(ENDPOINT_URL);
  url.pathname = '/auth/keys';

  const data = await request({ url: url.toString(), method: 'GET' });
  const key = JSON.parse(data).keys[0];

  const pubKey = new NodeRSA();
  pubKey.importKey({ n: Buffer.from(key.n, 'base64'), e: Buffer.from(key.e, 'base64') }, 'components-public');
  return pubKey.exportKey(['public']);
};

const verifyIdToken = async (idToken) => {
  const pubKey = await getApplePublicKey();
  return jwt.verify(idToken, pubKey, { algorithms: 'RS256' });
};


module.exports = {
  getAuthorizationUrl,
  getAuthorizationToken,
  refreshAuthorizationToken,
  verifyIdToken,
};