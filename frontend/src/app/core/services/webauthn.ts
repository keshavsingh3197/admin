/**
 * Minimal WebAuthn browser glue for the passkey ceremonies.
 *
 * The FIDO2 server (Fido2NetLib) speaks JSON in which every binary field — the challenge,
 * credential ids and the authenticator's response buffers — is base64url. The browser's
 * `navigator.credentials` API speaks ArrayBuffers instead. These helpers translate between the
 * two, so no third-party WebAuthn library is needed. Property names below match exactly what the
 * server serializes / expects (verified against the Fido2 model JSON contract).
 */

// ---- base64url <-> ArrayBuffer ----

function base64urlToBuffer(value: string): ArrayBuffer {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The options object as delivered by the server (binary fields are base64url strings). */
export interface ServerCredentialOptions {
  challenge: string;
  user?: { id: string; name: string; displayName: string };
  allowCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
  excludeCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
  [key: string]: unknown;
}

/** True when the browser can do WebAuthn at all. */
export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.PublicKeyCredential !== 'undefined'
    && !!navigator.credentials;
}

/** Runs a registration ceremony and returns the JSON body the server's complete endpoint expects. */
export async function createPasskey(options: ServerCredentialOptions): Promise<unknown> {
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...(options as unknown as PublicKeyCredentialCreationOptions),
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...(options.user as unknown as PublicKeyCredentialUserEntity),
      id: base64urlToBuffer(options.user!.id),
    },
    excludeCredentials: mapDescriptors(options.excludeCredentials),
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey creation was cancelled.');
  const response = credential.response as AuthenticatorAttestationResponse;

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(response.attestationObject),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      transports: response.getTransports ? response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

/** Runs an assertion (sign-in) ceremony and returns the JSON body the server expects. */
export async function getPasskeyAssertion(options: ServerCredentialOptions): Promise<unknown> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...(options as unknown as PublicKeyCredentialRequestOptions),
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: mapDescriptors(options.allowCredentials),
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey sign-in was cancelled.');
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

/**
 * Turns a WebAuthn ceremony failure into a short, user-safe message. A user cancelling or letting
 * the prompt time out (`NotAllowedError`) is not an error worth alarming them with.
 */
export function createPasskeyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'AbortError') return 'Passkey prompt was dismissed.';
    if (err.name === 'InvalidStateError') return 'This device already has a passkey for your account.';
    if (err.name === 'SecurityError') return 'Passkeys are not available on this page’s address.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function mapDescriptors(
  list?: Array<{ type: string; id: string; transports?: string[] }>,
): PublicKeyCredentialDescriptor[] | undefined {
  return list?.map(d => ({
    type: d.type as PublicKeyCredentialType,
    id: base64urlToBuffer(d.id),
    transports: d.transports as AuthenticatorTransport[] | undefined,
  }));
}
