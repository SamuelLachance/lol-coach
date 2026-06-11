/** URL publique du site — auto-detecte GitHub Pages ou tunnel local */
(function () {
  const host = typeof location !== "undefined" ? location.hostname : "";
  const isGithubPages = host.endsWith(".github.io");
  const isTryCloudflare = host.endsWith(".trycloudflare.com");
  const publicUrl = typeof location !== "undefined" ? location.origin + location.pathname.replace(/\/[^/]*$/, "/") : "";

  window.LoLSiteConfig = {
    APP_BUILD: "20250611-35",
    publicHost: host || "localhost",
    publicUrl: isGithubPages || isTryCloudflare ? publicUrl : "http://lolcoach.gotdns.ch",
    hosting: isGithubPages ? "github-pages" : isTryCloudflare ? "cloudflare-tunnel" : "local",
    patchDefaultsTunnelApi: "http://lolcoach.gotdns.ch/api/patch-defaults",
    PATCH_DEFAULTS_API: isGithubPages || isTryCloudflare ? undefined : "/api/patch-defaults",
  };
})();
