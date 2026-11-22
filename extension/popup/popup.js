const api = typeof browser !== "undefined" ? browser : chrome;
const toggle = document.getElementById("enabled");
const status = document.getElementById("status");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled
    ? "Reels are blocked on instagram.com."
    : "Reels are allowed. Turn back on to block them.";
}

api.storage.sync.get({ enabled: true }, (data) => render(data.enabled !== false));

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  api.storage.sync.set({ enabled });
  // The network redirect for full page loads lives in a static ruleset.
  api.declarativeNetRequest.updateEnabledRulesets(
    enabled ? { enableRulesetIds: ["block_reels"] } : { disableRulesetIds: ["block_reels"] }
  );
  render(enabled);
});
