(function () {
  const isSfPage =
    document.querySelector('body.sfdcBody') !== null ||
    document.getElementById('auraLoadingBox') !== null ||
    document.querySelector('[data-aura-rendered-by]') !== null ||
    location.hostname.endsWith('.my.salesforce.com') ||
    location.hostname.endsWith('.lightning.force.com');

  if (!isSfPage) return;

  chrome.runtime
    .sendMessage({ type: 'getSfHost', url: location.href })
    .then((response: unknown) => {
      const res = response as { sfHost: string | null };
      if (res?.sfHost) {
        chrome.runtime.sendMessage({ type: 'sfDetected', sfHost: res.sfHost });
      }
    })
    .catch(() => {});
})();
