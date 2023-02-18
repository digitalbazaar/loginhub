/*!
 * New BSD License (3-clause)
 * Copyright (c) 2017-2023, Digital Bazaar, Inc.
 * All rights reserved.
 */
import {BaseMediator} from './BaseMediator.js';
import {CredentialEventProxy} from './CredentialEventProxy.js';
import {HintManager} from './HintManager.js';
import {loadOnce} from 'credential-mediator-polyfill';
import {PermissionManager} from 'credential-mediator-polyfill';
import {WebShareHandler} from './WebShareHandler.js';

export class FirstPartyMediator extends BaseMediator {
  constructor() {
    super();
    this.credential = null;
    this.credentialRequestOptions = null;
    this.credentialRequestOrigin = null;
    this.credentialRequestOriginManifest = null;

    // FIXME: determine utility
    this.hide = null;
    this.ready = null;
    this.show = null;
  }

  async initialize({show, hide, ready} = {}) {
    // enable getting credential request origin asynchronously
    let deferredGetCredentialRequestOrigin;
    const credentialRequestOriginPromise = new Promise((resolve, reject) => {
      deferredGetCredentialRequestOrigin = {resolve, reject};
    });

    try {
      this.show = show;
      // FIXME: is `hide` needed?
      this.hide = hide;
      this.ready = ready;

      // this mediator instance is loaded in a 1p context that communicates
      // with the mediator instance in the 3p context; create an event proxy to
      // receive events from the 3p context
      const proxy = new CredentialEventProxy();
      const rpcServices = proxy.createServiceDescription();

      await loadOnce({
        credentialRequestOrigin: credentialRequestOriginPromise,
        // these are not supported in a 1p mediator; they are only used in a
        // 3p mediator
        requestPermission: throwNotSupportedError,
        getCredential: throwNotSupportedError,
        storeCredential: throwNotSupportedError,
        getCredentialHandlerInjector: throwNotSupportedError,
        rpcServices
      });

      // receive proxied event from mediator in 3p context
      this.proxiedEvent = await proxy.receive();
      const {
        type,
        credential,
        credentialRequestOptions,
        credentialRequestOrigin,
        credentialRequestOriginManifest,
        registrationHintOption
      } = this.proxiedEvent;
      this.credential = credential;
      this.credentialRequestOptions = credentialRequestOptions;
      this.credentialRequestOrigin = credentialRequestOrigin;
      this.credentialRequestOriginManifest = credentialRequestOriginManifest;
      this.registrationHintOption = registrationHintOption;
      deferredGetCredentialRequestOrigin.resolve(credentialRequestOrigin);

      this.hintManager = new HintManager();

      const needsHintSelection = type === 'selectcredentialhint';
      const requestType = needsHintSelection ?
        (credential ? 'credentialStore' : 'credentialRequest') :
        'requestPermission';
      await this.show({requestType});
      if(needsHintSelection) {
        await this.hintManager.initialize({
          credential, credentialRequestOptions,
          credentialRequestOrigin, credentialRequestOriginManifest
        });
      }
      await this.ready();
    } catch(e) {
      deferredGetCredentialRequestOrigin.reject(e);
      throw e;
    }
  }

  async allowCredentialHandler() {
    await super.allowCredentialHandler();
    const status = {state: 'granted'};
    this.proxiedEvent.respondWith({status});
    // FIXME: do we need to call `hide` here?
    await this.hide();
  }

  async denyCredentialHandler() {
    const status = {state: 'denied'};
    try {
      // set permission directly via permission manager
      const {relyingOrigin} = this;
      const pm = new PermissionManager(relyingOrigin, {request: () => status});
      pm._registerPermission('credentialhandler');
      await pm.request({name: 'credentialhandler'});
    } catch(e) {
      console.error(e);
    }
    this.proxiedEvent.respondWith({status});
    // FIXME: do we need to call `hide` here?
    await this.hide();
  }

  async getWebShareHandler() {
    const handler = new WebShareHandler();
    const {
      credential,
      credentialRequestOptions,
      credentialRequestOrigin
    } = this;
    await handler.initialize(
      {credential, credentialRequestOptions, credentialRequestOrigin});
    return handler;
  }

  async selectHint({hint}) {
    this.proxiedEvent.respondWith({choice: {hint}});
  }

  // FIXME: remove and use `getWebShareHandler` externally
  async webShare() {
    const handler = await this.getWebShareHandler();
    if(!handler.enabled) {
      console.log('WebShare not available on this platform.');
      return false;
    }
    await handler.share();
    return false;
  }
}

async function throwNotSupportedError() {
  const error = new Error('The operation is not supported.');
  error.name = 'NotSupportedError';
  return error;
}
