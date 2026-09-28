const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
const tagFilters = document.getElementById("tag-filters");
const grid = document.getElementById("recipe-grid");
const resultCount = document.getElementById("recipe-count");
const noResults = document.getElementById("no-filter-results");

if (searchInput && grid) {
  const activeTags = new Set<string>();

  function applyFilter() {
    const query = searchInput!.value.trim().toLowerCase();
    let visible = 0;
    grid!.querySelectorAll<HTMLElement>(".recipe-card").forEach((card) => {
      const title = card.dataset.title || "";
      const cardTags = (card.dataset.tags || "").split(",").filter(Boolean);
      const matchesSearch = !query || title.includes(query) || cardTags.some((tag) => tag.includes(query));
      const matchesTags = activeTags.size === 0 || Array.from(activeTags).every((t) => cardTags.includes(t));
      const matches = matchesSearch && matchesTags;
      card.hidden = !matches;
      if (matches) visible++;
    });
    if (resultCount) resultCount.textContent = `${visible} ${visible === 1 ? "recipe" : "recipes"}`;
    if (noResults) noResults.hidden = visible !== 0;
  }

  searchInput.addEventListener("input", applyFilter);

  tagFilters?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("tag-filter")) return;
    const tag = target.dataset.tag!;
    if (activeTags.has(tag)) {
      activeTags.delete(tag);
      target.setAttribute("aria-pressed", "false");
    } else {
      activeTags.add(tag);
      target.setAttribute("aria-pressed", "true");
    }
    applyFilter();
  });
}
