// SPDX-License-Identifier: GPL-3.0-or-later
// Download only on request. The worker verifies and saves the full engine;
// opening the hub still does not initialize GNUbg or download its assets.
export function installOfflineDownload() {
  const button = document.getElementById("download-offline"),
    status = document.getElementById("offline-status");
  if (!button || !status) return;
  if (!("serviceWorker" in navigator)) {
    button.disabled = true;
    status.textContent = "Offline downloads aren’t available in this browser.";
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Downloading the app and computer engine… Keep this window open.";
    status.dataset.state = "downloading";
    const channel = new MessageChannel();
    let timer;
    try {
      const result = await Promise.race([
        (async () => {
          const registration = await navigator.serviceWorker.ready;
          const version = new URL(document.querySelector('link[href*="styles.css?bgv="]').href).searchParams.get("bgv");
          return new Promise((resolve, reject) => {
            channel.port1.onmessage = ({data}) => {
              if (data.status === "ready" && data.version === version) resolve(data);
              else reject(new Error(data.message || "Refresh Backgammon and try again."));
            };
            registration.active.postMessage({type: "BACKGAMMON_PREPARE_OFFLINE", version}, [channel.port2]);
          });
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Download timed out. Stay online and try again.")), 120000);
        }),
      ]);
      if (result.status === "ready") {
        status.dataset.state = "ready";
        status.textContent = "Ready for offline play here. Online friend rooms need internet.";
        button.textContent = "Check offline download";
      }
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error.message;
    } finally {
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      button.disabled = false;
    }
  });
}
