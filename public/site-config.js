/** URL publique du site — auto-detecte GitHub Pages ou tunnel local */
(function () {
  const host = typeof location !== "undefined" ? location.hostname : "";
  const isGithubPages = host.endsWith(".github.io");
  const isTryCloudflare = host.endsWith(".trycloudflare.com");
  const publicUrl = typeof location !== "undefined" ? location.origin + location.pathname.replace(/\/[^/]*$/, "/") : "";

  window.LoLSiteConfig = {
    APP_BUILD: "20250611-27",
    publicHost: host || "localhost",
    publicUrl: isGithubPages || isTryCloudflare ? publicUrl : "http://lolcoach.gotdns.ch",
    hosting: isGithubPages ? "github-pages" : isTryCloudflare ? "cloudflare-tunnel" : "local",
  };
})();
