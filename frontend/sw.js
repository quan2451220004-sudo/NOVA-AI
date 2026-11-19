// Service Worker hỗ trợ cài đặt NexusAI thành ứng dụng điện thoại (PWA)
const CACHE_NAME = 'nexus-ai-cache-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Trực tiếp xử lý fetch qua mạng để luôn có phản hồi AI mới nhất
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
