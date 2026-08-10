document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".copy-recipe-button");
  if (!button) return;

  const { owner, repo, slug } = button.dataset;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Adding…";

  try {
    const res = await fetch("/api/recipes/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, repo, slug }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Copy failed");
    window.location.href = `/recipes/${json.slug}`;
  } catch (err) {
    alert(err instanceof Error ? err.message : "Copy failed");
    button.disabled = false;
    button.textContent = originalText;
  }
});
