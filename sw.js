
self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ChatNova RX", body: "You have a new message" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "ChatNova RX", {
      body: data.body || "You have a new message",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }

        return clients.openWindow(target);
      })
  );
});
