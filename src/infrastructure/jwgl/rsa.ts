import * as crypto from 'node:crypto';

/** 正方经典登录使用 RSA PKCS#1 v1.5；modulus/exponent 均为 base64。 */
export function encryptPassword(password: string, modulus: string, exponent: string): string {
  const toInteger = (value: Buffer): Buffer => {
    let source = value;
    while (source.length > 1 && source[0] === 0) source = source.subarray(1);
    if ((source[0] & 0x80) !== 0) source = Buffer.concat([Buffer.from([0]), source]);
    return source;
  };
  const tlv = (tag: number, content: Buffer): Buffer => {
    if (content.length < 0x80) return Buffer.concat([Buffer.from([tag, content.length]), content]);
    const lengthBytes: number[] = [];
    let length = content.length;
    while (length > 0) {
      lengthBytes.unshift(length & 0xff);
      length >>>= 8;
    }
    return Buffer.concat([Buffer.from([tag, 0x80 | lengthBytes.length, ...lengthBytes]), content]);
  };
  const sequence = tlv(0x30, Buffer.concat([
    tlv(0x02, toInteger(Buffer.from(modulus, 'base64'))),
    tlv(0x02, toInteger(Buffer.from(exponent, 'base64'))),
  ]));
  const base64 = sequence.toString('base64').match(/.{1,64}/g)!.join('\n');
  const pem = `-----BEGIN RSA PUBLIC KEY-----\n${base64}\n-----END RSA PUBLIC KEY-----`;
  return crypto.publicEncrypt(
    { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password),
  ).toString('base64');
}
