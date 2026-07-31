'use strict';

module.exports = function (/* environment, appConfig */) {
  // See https://zonkyio.github.io/ember-web-app for a list of
  // supported properties

  return {
    name: 'FaZoo',
    short_name: 'FaZoo',
    description: 'FaZoo app for activations',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#7b2fbe',
    prefer_related_applications: true,
    apple: {
      statusBarStyle: 'black-translucent',
      precomposed: 'true',
    },
    icons: [
      {
        src: '/favicon.png',
        sizes: '512x512',
      },
    ],
    ms: {
      tileColor: '#7b2fbe',
    },
  };
};
