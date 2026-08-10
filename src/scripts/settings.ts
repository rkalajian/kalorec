const copyButton = document.getElementById("copy-share-link");
copyButton?.addEventListener("click", async () => {
  const input = document.getElementById("share-link") as HTMLInputElement;
  await navigator.clipboard.writeText(input.value);
  const original = copyButton.textContent;
  copyButton.textContent = "Copied!";
  setTimeout(() => {
    copyButton.textContent = original;
  }, 2000);
});
