import { randomBytes } from 'node:crypto';
import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import { DOMParser } from '@xmldom/xmldom';
import { auditedIdentityTransaction, lockIdentity } from './recoveryProtection.mjs';
import { connectionFor } from './federationConfig.mjs';
import { federatedAccount } from './federationIdentity.mjs';
import { hash, issueCredential } from './identity.mjs';
import { insist, text } from './validation.mjs';

const ASSERTION = 'urn:oasis:names:tc:SAML:2.0:assertion';
const PROTOCOL = 'urn:oasis:names:tc:SAML:2.0:protocol';
const elements = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns, name));
const one = (node, ns, name) => {
  const found = elements(node, ns, name);

  insist(found.length === 1);

  return found[0];
};

function parse(xml) {
  insist(!xml.includes('<!') && !xml.includes(String.fromCharCode(0)));

  return new DOMParser({
    onError: () => {
      throw new Error('SAML XML refused');
    },
  }).parseFromString(xml, 'text/xml');
}

function envelope(xml, callback) {
  const doc = parse(xml);
  const root = doc.documentElement;

  insist(root.namespaceURI === PROTOCOL && root.localName === 'Response');
  insist(root.getAttribute('Destination') === callback);
  insist(elements(doc, PROTOCOL, 'Response').length === 1 && elements(doc, ASSERTION, 'Assertion').length === 1);

  const identifiers = elements(doc, '*', '*')
    .map((node) => node.getAttribute('ID'))
    .filter(Boolean);

  insist(new Set(identifiers).size === identifiers.length);

  const algorithms = elements(doc, 'http://www.w3.org/2000/09/xmldsig#', 'SignatureMethod');

  insist(
    algorithms.length === 2 &&
      algorithms.every(
        (node) => node.getAttribute('Algorithm') === 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      ),
  );

  const digests = elements(doc, 'http://www.w3.org/2000/09/xmldsig#', 'DigestMethod');

  insist(
    digests.length === 2 &&
      digests.every((node) => node.getAttribute('Algorithm') === 'http://www.w3.org/2001/04/xmlenc#sha256'),
  );

  return root.getAttribute('InResponseTo');
}

function verifiedProfile(profile, options) {
  insist(profile && typeof profile.getAssertionXml === 'function');

  const doc = parse(profile.getAssertionXml());
  const assertion = doc.documentElement;
  const issuer = one(assertion, ASSERTION, 'Issuer');
  const subject = one(assertion, ASSERTION, 'NameID');
  const confirmation = one(assertion, ASSERTION, 'SubjectConfirmation');
  const data = one(confirmation, ASSERTION, 'SubjectConfirmationData');
  const conditions = one(assertion, ASSERTION, 'Conditions');
  const end = Date.parse(data.getAttribute('NotOnOrAfter'));

  insist(issuer.textContent === options.issuer && profile.issuer === options.issuer);
  insist(subject.getAttribute('Format') === 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent');
  insist(confirmation.getAttribute('Method') === 'urn:oasis:names:tc:SAML:2.0:cm:bearer');
  insist(data.getAttribute('Recipient') === options.callback && data.getAttribute('InResponseTo') === options.request);
  insist(Number.isFinite(end) && end > Date.now() && end <= Date.now() + 300000);
  insist(Date.parse(conditions.getAttribute('NotOnOrAfter')) > Date.now());

  const raw = elements(assertion, ASSERTION, 'Attribute').filter((item) => item.getAttribute('Name') === 'groups');

  insist(raw.length <= 1);

  const groups = raw.flatMap((item) =>
    elements(item, ASSERTION, 'AttributeValue').map((value) => text(value.textContent)),
  );

  insist(groups.length <= 100);

  return { subject: text(subject.textContent, 1024), groups };
}

function cache(client, connection) {
  const { org, id, revision } = connection;
  const args = (key) => [org, id, revision, key];
  const get = async (key, consume) => {
    const sql = consume
      ? 'DELETE FROM fleet_saml_cache WHERE org=$1 AND connection=$2 AND revision=$3 AND key=$4 AND expires>now() RETURNING value'
      : 'SELECT value FROM fleet_saml_cache WHERE org=$1 AND connection=$2 AND revision=$3 AND key=$4 AND expires>now()';
    const result = await client.query(sql, args(key));

    return result.rows[0]?.value ?? null;
  };
  const save = async (key, value, until) => {
    const result = await client.query(
      'INSERT INTO fleet_saml_cache(org,connection,revision,key,value,expires) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (org,connection,key) DO NOTHING',
      [...args(key), value, new Date(until)],
    );

    return result.rowCount === 1;
  };

  return {
    getAsync: (key) => get(key, false),
    removeAsync: (key) => get(key, true),
    consumeAsync: (key) => get(key, true),
    saveIfAbsentAsync: save,
    async saveAsync(key, value) {
      await save(key, value, Date.now() + 300000);

      return { value, createdAt: Date.now() };
    },
  };
}

function samlClient(client, connection, origin) {
  const callback = `${origin}/v1/${connection.org}/sso/${connection.id}/acs`;
  const issuer = `${origin}/v1/${connection.org}/sso/${connection.id}`;
  const saml = new SAML({
    issuer,
    audience: issuer,
    callbackUrl: callback,
    idpIssuer: connection.issuer,
    entryPoint: connection.data.entryPoint,
    idpCert: connection.data.certificates,
    wantAuthnResponseSigned: true,
    wantAssertionsSigned: true,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: 300000,
    acceptedClockSkewMs: 0,
    maxAssertionAgeMs: 300000,
    rejectReplayedAssertions: true,
    identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    disableRequestedAuthnContext: true,
    cacheProvider: cache(client, connection),
  });

  return { saml, callback };
}

export async function startSso(pool, options) {
  return auditedIdentityTransaction(pool, async (client) => {
    await lockIdentity(client, options.org);

    const connection = await connectionFor(client, options.org, options.id);

    await client.query('DELETE FROM fleet_saml_cache WHERE org=$1 AND expires<=now()', [options.org]);

    const count = await client.query('SELECT count(*) FROM fleet_saml_cache WHERE org=$1', [options.org]);

    insist(Number(count.rows[0].count) < 10000, 429);

    const relay = randomBytes(32).toString('base64url');
    const browser = randomBytes(32).toString('base64url');
    const { saml } = samlClient(client, connection, options.origin);
    const location = await saml.getAuthorizeUrlAsync(relay, undefined, {});

    await cache(client, connection).saveAsync(`flow:${relay}`, hash(browser));

    return { location, browser };
  });
}

export async function finishSso(pool, options) {
  return auditedIdentityTransaction(pool, async (client) => {
    await lockIdentity(client, options.org);

    const connection = await connectionFor(client, options.org, options.id);
    const relay = text(options.body.RelayState, 128);
    const browser = text(options.browser, 128);
    const expected = await cache(client, connection).consumeAsync(`flow:${relay}`);

    insist(expected === hash(browser));

    const encoded = text(options.body.SAMLResponse, 131072);
    const xml = Buffer.from(encoded, 'base64').toString('utf8');
    const { saml, callback } = samlClient(client, connection, options.origin);
    const request = envelope(xml, callback);
    const result = await saml.validatePostResponseAsync({ SAMLResponse: encoded });
    const identity = verifiedProfile(result.profile, { issuer: connection.issuer, callback, request });
    const account = await federatedAccount(client, connection, identity.subject);

    insist(account.active);
    await client.query('UPDATE fleet_federated SET groups=$4 WHERE org=$1 AND connection=$2 AND subject=$3', [
      connection.org,
      connection.id,
      identity.subject,
      JSON.stringify(identity.groups),
    ]);

    return issueCredential(client, {
      org: connection.org,
      account: account.account,
      connection: connection.id,
      kind: 'session',
      duration: 12 * 3600000,
    });
  });
}
