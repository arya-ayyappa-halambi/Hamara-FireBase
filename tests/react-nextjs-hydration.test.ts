import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

async function run() {
  const React = require('react') as typeof import('react');
  const ReactDOMServer = require('react-dom/server') as typeof import('react-dom/server');

  const { FlareBaseProvider, useFlareBase } = require('../packages/react/src');

  const client = {
    auth: {},
    collection: () => ({}),
    storage: {},
  } as any;

  let serverClient: unknown;
  let hydratedClient: unknown;

  function Consumer() {
    const value = useFlareBase();

    if (typeof window === 'undefined') {
      serverClient = value;
    } else {
      hydratedClient = value;
    }

    return React.createElement('p', null, 'FlareBase hydrated');
  }

  const app = React.createElement(
    FlareBaseProvider,
    { client },
    React.createElement(Consumer),
  );

  // 1. Render on the server BEFORE installing browser globals.
  const html = ReactDOMServer.renderToString(app);

  assert.match(html, /FlareBase hydrated/);
  assert.equal(serverClient, client);

  // 2. Create the browser environment for hydration.
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://localhost:3000' },
  );

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });

  // 3. Hydrate the server-rendered HTML.
  const { act } = React;
  const { hydrateRoot } = require('react-dom/client') as typeof import('react-dom/client');

  const container = document.getElementById('root')!;
  container.innerHTML = html;

  let root: ReturnType<typeof hydrateRoot>;

  await act(async () => {
    root = hydrateRoot(container, app);
  });

  assert.equal(hydratedClient, client);
  assert.match(container.textContent || '', /FlareBase hydrated/);

  // 4. Clean up.
  await act(async () => {
    root.unmount();
  });

  dom.window.close();

  console.log('PASS: FlareBaseProvider server rendering and hydration');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
