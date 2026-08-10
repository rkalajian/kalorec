import { parseProfilePath } from "../lib/profileLookup";

const button = document.getElementById("profile-lookup-button");
const input = document.getElementById("profile-lookup") as HTMLInputElement | null;
const message = document.getElementById("profile-lookup-message");

if (button && input) {
  button.addEventListener("click", () => {
    const path = parseProfilePath(input.value);
    if (!path) {
      if (message) message.textContent = "Enter a profile like owner/repo, or paste a share link.";
      return;
    }
    window.location.href = path;
  });
}
