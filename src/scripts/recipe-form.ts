interface NutritionData {
  calories?: string;
  protein?: string;
  fat?: string;
  carbohydrates?: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
}

interface FormData_ {
  title: string;
  sourceUrl: string;
  image: string;
  tags: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  ingredients: string[];
  instructions: string[];
  nutrition: NutritionData;
  notes: string;
  public: boolean;
}

const form = document.getElementById("recipe-form") as HTMLFormElement;
const dataScript = document.getElementById("recipe-initial-data") as HTMLScriptElement;
const initial: FormData_ = JSON.parse(dataScript.textContent || "{}");

const ingredientsList = document.getElementById("ingredients-list")!;
const instructionsList = document.getElementById("instructions-list")!;

const rowInputClass = "flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const removeButtonClass = "rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";
let ingredientRowId = 0;
let instructionRowId = 0;

function addRow(container: HTMLElement, kind: "ingredient" | "instruction", value = "") {
  const row = document.createElement("div");
  row.className = "mt-2 flex gap-2";
  const number = kind === "ingredient" ? ++ingredientRowId : ++instructionRowId;
  const name = kind === "ingredient" ? "Ingredient" : "Step";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.className = `${kind}-input ${rowInputClass}`;
  input.setAttribute("aria-label", `${name} ${number}`);
  input.placeholder = kind === "ingredient" ? "e.g. 2 cups flour" : "e.g. Preheat oven to 350°F";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = removeButtonClass;
  removeBtn.textContent = "Remove";
  removeBtn.setAttribute("aria-label", `Remove ${name.toLowerCase()} ${number}`);
  removeBtn.addEventListener("click", () => row.remove());
  row.append(input, removeBtn);
  container.append(row);
}

function renderRows() {
  ingredientsList.innerHTML = "";
  instructionsList.innerHTML = "";
  (initial.ingredients.length ? initial.ingredients : [""]).forEach((v) => addRow(ingredientsList, "ingredient", v));
  (initial.instructions.length ? initial.instructions : [""]).forEach((v) => addRow(instructionsList, "instruction", v));
}

function fillField(id: string, value: string | undefined) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value ?? "";
}

function fillForm(data: FormData_) {
  fillField("title", data.title);
  fillField("tags", data.tags);
  fillField("servings", data.servings);
  fillField("prepTime", data.prepTime);
  fillField("cookTime", data.cookTime);
  fillField("image", data.image);
  fillField("sourceUrl", data.sourceUrl);
  fillField("notes", data.notes);
  fillField("nutrition-calories", data.nutrition.calories);
  fillField("nutrition-protein", data.nutrition.protein);
  fillField("nutrition-fat", data.nutrition.fat);
  fillField("nutrition-carbohydrates", data.nutrition.carbohydrates);
  fillField("nutrition-fiber", data.nutrition.fiber);
  fillField("nutrition-sugar", data.nutrition.sugar);
  fillField("nutrition-sodium", data.nutrition.sodium);
  (document.getElementById("public") as HTMLInputElement).checked = data.public;
  initial.ingredients = data.ingredients;
  initial.instructions = data.instructions;
  renderRows();
}

fillForm(initial);

document.getElementById("add-ingredient")!.addEventListener("click", () => addRow(ingredientsList, "ingredient"));
document.getElementById("add-instruction")!.addEventListener("click", () => addRow(instructionsList, "instruction"));

function collectRows(container: HTMLElement, kind: "ingredient" | "instruction"): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>(`.${kind}-input`))
    .map((el) => el.value.trim())
    .filter(Boolean);
}

type MessageKind = "info" | "warning" | "error";

const messageKindClasses: Record<"warning" | "error", string[]> = {
  warning: ["text-amber-700", "dark:text-amber-400"],
  error: ["text-red-700", "dark:text-red-400"],
};

function showMessage(id: string, text: string, kind: MessageKind = "info") {
  const el = document.getElementById(id)!;
  el.textContent = text;
  el.classList.remove(...messageKindClasses.warning, ...messageKindClasses.error);
  if (kind !== "info") el.classList.add(...messageKindClasses[kind]);
}

const importButton = document.getElementById("import-button");
if (importButton) {
  importButton.addEventListener("click", async () => {
    const urlInput = document.getElementById("import-url") as HTMLInputElement;
    const url = urlInput.value.trim();
    if (!url) return;
    showMessage("import-message", "Importing…", "info");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      fillForm({
        title: json.recipe.title ?? "",
        sourceUrl: json.recipe.sourceUrl ?? url,
        image: json.recipe.image ?? "",
        tags: (json.recipe.tags ?? []).join(", "),
        servings: json.recipe.servings ?? "",
        prepTime: json.recipe.prepTime ?? "",
        cookTime: json.recipe.cookTime ?? "",
        ingredients: json.recipe.ingredients ?? [],
        instructions: json.recipe.instructions ?? [],
        nutrition: json.recipe.nutrition ?? {},
        notes: json.recipe.notes ?? "",
        public: false,
      });
      showMessage(
        "import-message",
        json.warning || "Imported. Review the fields below before saving.",
        json.warning ? "warning" : "info"
      );
    } catch (err) {
      showMessage("import-message", err instanceof Error ? err.message : "Import failed", "error");
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = form.dataset.mode as "create" | "edit";
  const slug = form.dataset.slug;

  const title = (document.getElementById("title") as HTMLInputElement).value.trim();
  if (!title) {
    showMessage("form-message", "Title is required", "error");
    return;
  }

  const sharingInput = document.getElementById("public") as HTMLInputElement;
  if (sharingInput.disabled && initial.public) {
    showMessage("form-message", "Select a private recipe repo and its public sharing repo in Settings before editing this shared recipe.", "error");
    return;
  }

  const payload = {
    title,
    tags: (document.getElementById("tags") as HTMLInputElement).value.split(",").map((t) => t.trim()).filter(Boolean),
    servings: (document.getElementById("servings") as HTMLInputElement).value.trim(),
    prepTime: (document.getElementById("prepTime") as HTMLInputElement).value.trim(),
    cookTime: (document.getElementById("cookTime") as HTMLInputElement).value.trim(),
    image: (document.getElementById("image") as HTMLInputElement).value.trim(),
    sourceUrl: (document.getElementById("sourceUrl") as HTMLInputElement).value.trim(),
    notes: (document.getElementById("notes") as HTMLTextAreaElement).value.trim(),
    ingredients: collectRows(ingredientsList, "ingredient"),
    instructions: collectRows(instructionsList, "instruction"),
    nutrition: {
      calories: (document.getElementById("nutrition-calories") as HTMLInputElement).value.trim(),
      protein: (document.getElementById("nutrition-protein") as HTMLInputElement).value.trim(),
      fat: (document.getElementById("nutrition-fat") as HTMLInputElement).value.trim(),
      carbohydrates: (document.getElementById("nutrition-carbohydrates") as HTMLInputElement).value.trim(),
      fiber: (document.getElementById("nutrition-fiber") as HTMLInputElement).value.trim(),
      sugar: (document.getElementById("nutrition-sugar") as HTMLInputElement).value.trim(),
      sodium: (document.getElementById("nutrition-sodium") as HTMLInputElement).value.trim(),
    },
    public: sharingInput.checked,
    expectedSha: form.dataset.sha || undefined,
  };

  const url = mode === "create" ? "/api/recipes" : `/api/recipes/${slug}`;
  const method = mode === "create" ? "POST" : "PUT";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Save failed");
    window.location.href = `/recipes/${encodeURIComponent(json.slug)}${json.warning ? "?sharing=failed" : ""}`;
  } catch (err) {
    showMessage("form-message", err instanceof Error ? err.message : "Save failed", "error");
  }
});

const deleteButton = document.getElementById("delete-button");
if (deleteButton) {
  deleteButton.addEventListener("click", async () => {
    if (!confirm("Delete this recipe? This cannot be undone.")) return;
    const slug = form.dataset.slug;
    try {
      const res = await fetch(`/api/recipes/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Delete failed");
      }
      window.location.href = "/";
    } catch (err) {
      showMessage("form-message", err instanceof Error ? err.message : "Delete failed", "error");
    }
  });
}
