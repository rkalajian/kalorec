const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
const tagFilters = document.getElementById("tag-filters");
const grid = document.getElementById("recipe-grid");

if (searchInput && grid) {
  const activeTags = new Set<string>();

  function applyFilter() {
    const query = searchInput!.value.trim().toLowerCase();
    grid!.querySelectorAll<HTMLElement>(".recipe-card").forEach((card) => {
      const title = card.dataset.title || "";
      const cardTags = (card.dataset.tags || "").split(",").filter(Boolean);
      const matchesSearch = !query || title.includes(query);
      const matchesTags = activeTags.size === 0 || Array.from(activeTags).every((t) => cardTags.includes(t));
      card.style.display = matchesSearch && matchesTags ? "" : "none";
    });
  }

  searchInput.addEventListener("input", applyFilter);

  tagFilters?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("tag-filter")) return;
    const tag = target.dataset.tag!;
    if (activeTags.has(tag)) {
      activeTags.delete(tag);
      target.classList.remove("active");
    } else {
      activeTags.add(tag);
      target.classList.add("active");
    }
    applyFilter();
  });
}
