/*!
 * New BSD License (3-clause)
 * Copyright (c) 2017-2023, Digital Bazaar, Inc.
 * All rights reserved.
 */
import {utils} from 'web-request-rpc';

export function getOriginName({origin, manifest} = {}) {
  const {host} = utils.parseUrl(origin);
  if(!manifest) {
    return host;
  }
  const {name, short_name} = manifest;
  return name || short_name || host;
}

export async function autoRegisterHint({hint}) {
  const {
    hintOption: {credentialHandler},
    manifest: {credential_handler: {enabledTypes}},
    name
  } = hint;
  await navigator.credentialMediator.ui.registerCredentialHandler(
    credentialHandler, {name, enabledTypes, icons: []});
}

// FIXME: change to `createRegistrationHintOption` or similar
export async function createDefaultHintOption({origin, manifest} = {}) {
  if(!(manifest && manifest.credential_handler &&
    manifest.credential_handler.url &&
    Array.isArray(manifest.credential_handler.enabledTypes))) {
    // manifest does not have credential handler info
    return null;
  }

  // resolve credential handler URL
  let credentialHandler;
  try {
    credentialHandler = new URL(manifest.credential_handler.url, origin).href;
  } catch(e) {
    console.error(e);
    return null;
  }

  return {
    credentialHandler,
    credentialHintKey: 'default',
    enabledTypes: manifest.credential_handler.enabledTypes
  };
}
