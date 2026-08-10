import { parseProfilePath } from "../lib/profileLookup";

const button = document.getElementById("profile-lookup-button");
const input = document.getElementById("profile-lookup") as HTMLInputElement | null;
const message = document.getElementById("profile-lookup-message");

function attemptLookup() {
  if (!input) return;
  if (message) message.textContent = "";
  input.removeAttribute("aria-invalid");

  const path = parseProfilePath(input.value);
  if (!path) {
    if (message) message.textContent = "Enter a profile like owner/repo, or paste a share link.";
    input.setAttribute("aria-invalid", "true");
    return;
  }
  window.location.href = path;
}

if (button && input) {
  button.addEventListener("click", attemptLookup);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") attemptLookup();
  });
}
