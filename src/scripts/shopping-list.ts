export {};

interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
  source?: string;
}

const itemList = document.getElementById("shopping-items") as HTMLUListElement;
const emptyMessage = document.getElementById("list-empty") as HTMLParagraphElement;
const listStatus = document.getElementById("list-status") as HTMLParagraphElement;
const listError = document.getElementById("list-error") as HTMLParagraphElement;
const selectionMessage = document.getElementById("selection-message") as HTMLParagraphElement | null;
const recipeChoices = Array.from(document.querySelectorAll<HTMLInputElement>(".recipe-choice"));
const addSelected = document.getElementById("add-selected") as HTMLButtonElement | null;
const addItemForm = document.getElementById("add-item-form") as HTMLFormElement;
const newItem = document.getElementById("new-item") as HTMLInputElement;
const addItem = document.getElementById("add-item") as HTMLButtonElement;
const saveButton = document.getElementById("save-list") as HTMLButtonElement;
const reloadButton = document.getElementById("reload-list") as HTMLButtonElement;
const copyButton = document.getElementById("copy-list") as HTMLButtonElement;
const printButton = document.getElementById("print-list") as HTMLButtonElement;

const MAX_ITEMS = 500;
const MAX_TEXT = 1000;
let items: ShoppingItem[] = [];
let sha: string | null = null;
let ready = false;
let busy = false;
let dirty = false;

function setStatus(message: string, error = false) {
  listStatus.textContent = error ? "" : message;
  listError.textContent = error ? message : "";
}

function updateControls() {
  const editable = ready && !busy;
  recipeChoices.forEach((choice) => { choice.disabled = !editable; });
  if (addSelected) addSelected.disabled = !editable;
  newItem.disabled = !editable;
  addItem.disabled = !editable;
  saveButton.disabled = !ready;
  saveButton.setAttribute("aria-disabled", String(!editable || !dirty));
  copyButton.disabled = !editable || items.length === 0;
  printButton.disabled = !editable || items.length === 0;
  reloadButton.setAttribute("aria-disabled", String(busy));
}

function markDirty() {
  dirty = true;
  setStatus(items.length === 0
    ? "No items remain. Unsaved changes. Save your list before leaving."
    : "Unsaved changes. Save your list before leaving.");
  updateControls();
}

function render() {
  itemList.replaceChildren();
  emptyMessage.hidden = items.length > 0;

  for (const [index, item] of items.entries()) {
    const row = document.createElement("li");
    row.className = "rounded-md border border-zinc-200 p-3 dark:border-zinc-700 print:border-0 print:p-1";

    const controls = document.createElement("div");
    controls.className = "flex flex-wrap items-center gap-2 print:hidden";

    const checkLabel = document.createElement("label");
    checkLabel.className = "flex min-h-10 min-w-10 cursor-pointer items-center justify-center";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.checked;
    checkbox.className = "size-5 accent-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700";
    const checkText = document.createElement("span");
    checkText.className = "sr-only";
    checkText.textContent = `Mark item ${index + 1}, ${item.text || "empty item"}, purchased`;
    checkLabel.append(checkbox, checkText);

    const textLabel = document.createElement("label");
    textLabel.className = "min-w-40 flex-1";
    const textLabelText = document.createElement("span");
    textLabelText.className = "sr-only";
    textLabelText.textContent = `Item ${index + 1} text`;
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.maxLength = MAX_TEXT;
    textInput.value = item.text;
    textInput.setAttribute("aria-describedby", "item-limit-hint");
    textInput.className = "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
    textLabel.append(textLabelText, textInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "min-h-10 rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:border-zinc-700 dark:hover:bg-zinc-800";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove item ${index + 1}, ${item.text || "empty item"}`);
    controls.append(checkLabel, textLabel, removeButton);

    const printText = document.createElement("span");
    printText.className = "hidden break-words print:inline";
    const updatePrintText = () => { printText.textContent = `${item.checked ? "[x]" : "[ ]"} ${item.text}`; };
    updatePrintText();

    checkbox.addEventListener("change", () => {
      item.checked = checkbox.checked;
      updatePrintText();
      markDirty();
    });
    textInput.addEventListener("input", () => {
      item.text = textInput.value;
      if (item.text.trim()) {
        textInput.removeAttribute("aria-invalid");
        textInput.setAttribute("aria-describedby", "item-limit-hint");
      }
      checkText.textContent = `Mark item ${index + 1}, ${item.text || "empty item"}, purchased`;
      removeButton.setAttribute("aria-label", `Remove item ${index + 1}, ${item.text || "empty item"}`);
      updatePrintText();
      markDirty();
    });
    removeButton.addEventListener("click", () => {
      const index = items.findIndex((candidate) => candidate.id === item.id);
      if (index === -1) return;
      items.splice(index, 1);
      render();
      const remaining = itemList.querySelectorAll<HTMLButtonElement>("button");
      (remaining[Math.min(index, remaining.length - 1)] ?? newItem).focus();
      markDirty();
    });

    row.append(controls, printText);
    if (item.source) {
      const source = document.createElement("p");
      source.className = "mt-1 break-words pl-12 text-xs text-zinc-600 dark:text-zinc-400 print:mt-0 print:pl-6 print:text-zinc-700";
      source.textContent = `From ${item.source}`;
      row.append(source);
    }
    itemList.append(row);
  }
  updateControls();
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.error === "string") return body.error;
  } catch { /* Use the fallback below. */ }
  if (response.status === 401) return "Session expired. Log in again.";
  return `Request failed (${response.status}). Try again.`;
}

async function loadList() {
  const wasReady = ready;
  busy = true;
  updateControls();
  setStatus("Loading saved list…");
  try {
    const response = await fetch("/api/shopping-list", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response));
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" ||
        !Array.isArray((body as any).items) ||
        !((body as any).sha === null || typeof (body as any).sha === "string")) {
      throw new Error("Saved list response was invalid. Try reloading.");
    }
    items = (body as { items: ShoppingItem[] }).items;
    sha = (body as { sha: string | null }).sha;
    ready = true;
    dirty = false;
    render();
    setStatus(items.length ? "Saved list loaded." : "No saved items yet.");
  } catch (error) {
    ready = wasReady;
    setStatus(error instanceof TypeError ? "Could not reach the app. Check your connection or sign in again."
      : error instanceof Error ? error.message : "Could not load your list.", true);
  } finally {
    busy = false;
    updateControls();
  }
}

addSelected?.addEventListener("click", () => {
  const selected = recipeChoices.filter((choice) => choice.checked);
  if (selected.length === 0) {
    if (selectionMessage) selectionMessage.textContent = "Choose at least one recipe.";
    return;
  }
  const additions: ShoppingItem[] = [];
  for (const choice of selected) {
    let ingredients: unknown;
    try { ingredients = JSON.parse(choice.dataset.ingredients ?? "[]"); }
    catch { ingredients = []; }
    if (!Array.isArray(ingredients)) continue;
    for (const ingredient of ingredients) {
      if (typeof ingredient !== "string" || !ingredient.trim()) continue;
      const text = ingredient;
      if (text.length > MAX_TEXT) {
        if (selectionMessage) selectionMessage.textContent = "A recipe ingredient exceeds 1,000 characters. Shorten it in the recipe before adding.";
        return;
      }
      const source = choice.dataset.title?.trim().slice(0, 200);
      additions.push({ id: crypto.randomUUID(), text, checked: false, ...(source ? { source } : {}) });
    }
  }
  if (items.length + additions.length > MAX_ITEMS) {
    if (selectionMessage) selectionMessage.textContent = "A shopping list can hold up to 500 items. Remove some items before adding more.";
    return;
  }
  if (additions.length === 0) {
    if (selectionMessage) selectionMessage.textContent = "Selected recipes have no ingredients to add.";
    return;
  }
  items.push(...additions);
  selected.forEach((choice) => { choice.checked = false; });
  render();
  markDirty();
  if (selectionMessage) selectionMessage.textContent = `Added ${additions.length} ingredient${additions.length === 1 ? "" : "s"}.`;
});

addItemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = newItem.value;
  if (!text.trim()) {
    setStatus("Enter an item before adding it.", true);
    newItem.setAttribute("aria-invalid", "true");
    newItem.setAttribute("aria-describedby", "item-limit-hint list-error");
    newItem.focus();
    return;
  }
  if (items.length >= MAX_ITEMS) {
    setStatus("A shopping list can hold up to 500 items.", true);
    return;
  }
  items.push({ id: crypto.randomUUID(), text, checked: false });
  newItem.value = "";
  render();
  markDirty();
  newItem.focus();
});

newItem.addEventListener("input", () => {
  if (!newItem.value.trim()) return;
  newItem.removeAttribute("aria-invalid");
  newItem.setAttribute("aria-describedby", "item-limit-hint");
  listError.textContent = "";
});

saveButton.addEventListener("click", async () => {
  if (!dirty || busy) return;
  if (items.some((item) => !item.text.trim())) {
    setStatus("Fill in or remove empty items before saving.", true);
    const emptyInput = Array.from(itemList.querySelectorAll<HTMLInputElement>("input[type=text]"))
      .find((input) => !input.value.trim());
    emptyInput?.setAttribute("aria-invalid", "true");
    emptyInput?.setAttribute("aria-describedby", "item-limit-hint list-error");
    emptyInput?.focus();
    return;
  }
  busy = true;
  updateControls();
  setStatus("Saving list…");
  try {
    const nextItems = items.map((item) => ({ ...item }));
    const response = await fetch("/api/shopping-list", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: nextItems, expectedSha: sha }),
    });
    if (!response.ok) {
      const message = await responseError(response);
      throw new Error(response.status === 409 && message.toLowerCase().includes("changed elsewhere")
        ? `${message} Copy your edits, then reload before saving.` : message);
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || typeof (body as any).sha !== "string") {
      throw new Error("List may have saved, but the response was invalid. Reload before saving again.");
    }
    items = nextItems;
    sha = (body as { sha: string }).sha;
    dirty = false;
    render();
    setStatus("List saved in your private repo.");
  } catch (error) {
    setStatus(error instanceof TypeError ? "Could not reach the app. Check your connection or sign in again."
      : error instanceof Error ? error.message : "Could not save your list.", true);
  } finally {
    busy = false;
    updateControls();
  }
});

reloadButton.addEventListener("click", () => {
  if (busy) return;
  if (dirty && !window.confirm("Discard unsaved changes and reload your list?")) return;
  void loadList();
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(items.map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.text}`).join("\n"));
    setStatus("List copied.");
  } catch {
    setStatus("Copy failed. Try again or print the list.", true);
  }
});

printButton.addEventListener("click", () => window.print());
window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

emptyMessage.hidden = true;
void loadList();
