// Service Worker - 缓存策略
const CACHE_NAME = 'pupu-cosmos-v1';
const CACHE_VERSION = '1.0.0';

// 需要缓存的资源列表
const CACHE_FILES = [
    './',
    './index.html',
    './css/googleapis.css',
    './css/awesome.css',
    './js/tailwindcss.js',
    './js/confrtti_browser.js',
    './img/shu.png',
    './img/friends.jpg',
    './webfonts/fa-solid-900.woff2',
    './webfonts/fa-solid-900.ttf'
];

// 需要缓存的音频文件路径模式
const AUDIO_PATTERN = /\.mp3$/i;
const IMAGE_PATTERN = /\.(jpg|jpeg|png|gif|webp)$/i;

// 安装 Service Worker
self.addEventListener('install', (event) => {
    console.log('[Service Worker] 安装中...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] 缓存静态资源');
                // 只缓存关键资源，大文件按需缓存
                const filesToCache = CACHE_FILES.filter(url => {
                    // 排除音频文件，它们会按需缓存
                    return !AUDIO_PATTERN.test(url);
                });
                
                // 使用 Promise.allSettled 避免单个文件失败导致整个安装失败
                return Promise.allSettled(
                    filesToCache.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`[Service Worker] 无法缓存 ${url}:`, err);
                            return null;
                        })
                    )
                ).then(() => {
                    console.log('[Service Worker] 静态资源缓存完成');
                });
            })
            .catch((error) => {
                console.error('[Service Worker] 缓存失败:', error);
                // 即使缓存失败，也继续安装
            })
    );
    // 强制激活新的 Service Worker
    self.skipWaiting();
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] 激活中...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 删除旧版本的缓存
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 立即控制所有页面
    return self.clients.claim();
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // 只处理同源请求
    if (url.origin !== location.origin) {
        return;
    }

    // 对于音频文件，暂时跳过 Service Worker，直接使用浏览器原生缓存
    // 这样可以避免 MIME 类型和缓存问题
    const isAudio = AUDIO_PATTERN.test(url.pathname);
    
    if (isAudio) {
        // 直接返回 fetch，让浏览器自己处理缓存
        // 这样可以利用浏览器的 HTTP 缓存，同时避免 Service Worker 的兼容性问题
        event.respondWith(
            fetch(event.request).catch((error) => {
                console.error('[Service Worker] 音频获取失败:', error);
                // 如果网络失败，尝试从缓存获取
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        console.log('[Service Worker] 从缓存返回音频:', event.request.url);
                        return cachedResponse;
                    }
                    throw error;
                });
            })
        );
        return;
    }

    // 对于其他资源，使用标准缓存策略
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // 如果缓存中有，直接返回
                if (cachedResponse) {
                    console.log('[Service Worker] 从缓存返回:', event.request.url);
                    return cachedResponse;
                }

                // 否则从网络获取
                return fetch(event.request)
                    .then((response) => {
                        // 检查响应是否有效（放宽检查条件）
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // 克隆响应（因为响应是流，只能使用一次）
                        const responseToCache = response.clone();

                        // 判断是否需要缓存
                        const shouldCache = 
                            IMAGE_PATTERN.test(url.pathname) ||  // 图片文件
                            url.pathname.endsWith('.css') ||     // CSS文件
                            url.pathname.endsWith('.js') ||      // JS文件
                            url.pathname.endsWith('.woff2') ||   // 字体文件
                            url.pathname.endsWith('.ttf');       // 字体文件

                        if (shouldCache) {
                            caches.open(CACHE_NAME).then((cache) => {
                                console.log('[Service Worker] 缓存新资源:', event.request.url);
                                cache.put(event.request, responseToCache).catch((err) => {
                                    console.warn('[Service Worker] 缓存失败:', err);
                                });
                            });
                        }

                        return response;
                    })
                    .catch((error) => {
                        console.error('[Service Worker] 获取失败:', error);
                        throw error;
                    });
            })
    );
});

// 监听消息（用于手动清除缓存）
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[Service Worker] 缓存已清除');
            event.ports[0].postMessage({ success: true });
        });
    }
});

