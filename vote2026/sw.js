const CACHE_NAME = 'kodomo-senkyo-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './lib/supabase.js',
  './lib/utils.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // GETリクエスト以外（POST, PUT, DELETE等）はキャッシュ対象外のためそのままスルー
  if (event.request.method !== 'GET') return;

  // HTTP/HTTPSリクエストのみを対象にする
  if (!event.request.url.startsWith('http')) return;

  // Supabase等の外部API通信はキャッシュ対象外のためスルー
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 正常取得できればキャッシュを最新版に更新
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        // オフライン等でネットワーク失敗した場合のみキャッシュから読み取る
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // キャッシュが存在しない場合でも Response オブジェクトを返して TypeError を防ぐ
        return new Response('Network error or resource not cached', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
