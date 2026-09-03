import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML document the web build is served inside.
 *
 * Used only by the static web export — a phone never renders this. It exists
 * because the export was shipping `<title></title>`: an empty tab, a browser
 * bookmark named after the URL, and a share preview with no name on it. The
 * app has been called Flipp everywhere else since the beginning.
 *
 * Nothing here is per-route. A screen wanting its own title sets it with
 * expo-router's own Head.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/*
          No <title> here on purpose. Expo Router renders its own, and it
          comes first in the document — which is the one a browser honours.
          A second title in this shell is silently ignored. The real one is
          set with Head in the root layout.
        */}
        <meta
          name="description"
          content="Turn your notes into practice questions. Works offline."
        />

        {/* Added to a home screen, it should be Flipp rather than the URL. */}
        <meta name="apple-mobile-web-app-title" content="Flipp" />
        <meta name="application-name" content="Flipp" />

        {/* The one bit of chrome the browser paints for us: match the page. */}
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF3E1" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#373D33" />

        {/*
          Required by Expo Router: undoes the body-level scroll lock so the
          app scrolls the way it does on a phone. Leaving it out means a
          second scrollbar and a page that fights itself.
        */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
