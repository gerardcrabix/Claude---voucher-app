// Polyfills pour navigateurs/WebView plus anciens. À importer en tout
// premier, avant tout le reste.
//
// Promise.withResolvers() est une API ES2024, supportée par Safari/WebKit
// seulement à partir de la version 17.4 (iOS 17.4, mars 2024). pdfjs-dist
// l'utilise abondamment en interne. Sur un WebKit plus ancien, l'appeler
// lève "undefined is not a function" — exactement l'erreur remontée lors de
// l'extraction PDF sur un vrai iPhone. Ce polyfill comble le manque, sans
// rien changer là où l'API native existe déjà.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
