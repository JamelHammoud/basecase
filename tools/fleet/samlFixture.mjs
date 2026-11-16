import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { SignedXml } from 'xml-crypto';

export const signingKey = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
export const escapeXml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export function responseXml(options) {
  const { issuer, audience, callback, request, key, subject = 'same-subject', groups = ['ward'] } = options;
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + (options.expiry ?? 120000)).toISOString();
  const before = new Date(Date.now() - 1000).toISOString();
  const values = groups.map((value) => `<saml:AttributeValue>${escapeXml(value)}</saml:AttributeValue>`).join('');
  const assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${now}"><saml:Issuer>${escapeXml(issuer)}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">${escapeXml(subject)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${request}" Recipient="${escapeXml(options.recipient ?? callback)}" NotOnOrAfter="${expires}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${expires}"><saml:AudienceRestriction><saml:Audience>${escapeXml(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now}" SessionIndex="_${randomUUID()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="groups">${values}</saml:Attribute><saml:Attribute Name="email"><saml:AttributeValue>same@example.test</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>`;
  const signedAssertion = sign(assertion, 'Assertion', key);
  const response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_${randomUUID()}" Version="2.0" IssueInstant="${now}" InResponseTo="${request}" Destination="${escapeXml(callback)}"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${escapeXml(issuer)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${signedAssertion}</samlp:Response>`;

  return sign(response, 'Response', key);
}

function sign(xml, element, key) {
  const signer = new SignedXml({
    privateKey: key.privateKey,
    publicCert: key.publicKey,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });

  signer.addReference({
    xpath: `/*[local-name()='${element}']`,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  signer.computeSignature(xml, { location: { reference: '/*/*[local-name()="Issuer"]', action: 'after' } });

  return signer.getSignedXml();
}

export function authRequest(url) {
  const parsed = new URL(url);
  const xml = inflateRawSync(Buffer.from(parsed.searchParams.get('SAMLRequest'), 'base64')).toString();

  return {
    request: /\bID="([^"]+)"/.exec(xml)[1],
    callback: /AssertionConsumerServiceURL="([^"]+)"/.exec(xml)[1].replaceAll('&amp;', '&'),
    audience: /<saml:Issuer[^>]*>([^<]+)/.exec(xml)[1],
    relay: parsed.searchParams.get('RelayState'),
  };
}
