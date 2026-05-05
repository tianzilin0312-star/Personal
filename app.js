const storeKey = "meal-basket-v1";

const sampleRecipes = [
  {
    id: crypto.randomUUID(),
    name: "Tomato Pasta",
    ingredients: ["pasta", "tomato sauce", "garlic", "parmesan", "spinach"],
  },
  {
    id: crypto.randomUUID(),
    name: "Breakfast Burritos",
    ingredients: ["tortillas", "eggs", "cheese", "salsa", "avocado"],
  },
  {
    id: crypto.randomUUID(),
    name: "Rice Bowls",
    ingredients: ["rice", "chicken", "cucumber", "carrots", "soy sauce"],
  },
];

let state = {
  recipes: [],
  selectedRecipeIds: [],
  editingRecipeId: null,
};

const views = document.querySelectorAll(".view");
const tabButtons = document.querySelectorAll("[data-view-button]");
const recipeForm = document.querySelector("#recipe-form");
const recipeName = document.querySelector("#recipe-name");
const recipeIngredients = document.querySelector("#recipe-ingredients");
const saveRecipe = document.querySelector("#save-recipe");
const cancelEdit = document.querySelector("#cancel-edit");
const loadSample = document.querySelector("#load-sample");
const recipeList = document.querySelector("#recipe-list");
const recipeCount = document.querySelector("#recipe-count");
const mealList = document.querySelector("#meal-list");
const clearWeek = document.querySelector("#clear-week");
const groceryList = document.querySelector("#grocery-list");
const emptyGrocery = document.querySelector("#empty-grocery");
const ingredientCount = document.querySelector("#ingredient-count");
const copyList = document.querySelector("#copy-list");
const copyStatus = document.querySelector("#copy-status");

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(storeKey);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    state = {
      recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
      selectedRecipeIds: Array.isArray(parsed.selectedRecipeIds) ? parsed.selectedRecipeIds : [],
      editingRecipeId: null,
    };
  } catch {
    localStorage.removeItem(storeKey);
  }
}

function cleanIngredientLines(value) {
  const seen = new Set();

  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const key = normalizeIngredient(line);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeIngredient(ingredient) {
  return ingredient.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueGroceries() {
  const selected = new Set(state.selectedRecipeIds);
  const groceries = [];
  const seen = new Set();

  state.recipes
    .filter((recipe) => selected.has(recipe.id))
    .forEach((recipe) => {
      recipe.ingredients.forEach((ingredient) => {
        const key = normalizeIngredient(ingredient);
        if (!seen.has(key)) {
          seen.add(key);
          groceries.push(ingredient);
        }
      });
    });

  return groceries.sort((a, b) => a.localeCompare(b));
}

function foodBadge(name) {
  const colors = ["#ffd36d", "#ffb3a7", "#b8e6c8", "#bcd6ff", "#f5bfdd"];
  const color = colors[[...name].reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length];

  return `
    <div class="food-badge" style="background:${color}" aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path d="M12 34c2-12 10-19 22-19 10 0 17 6 19 17 1 10-6 18-19 19-13 0-22-7-22-17z" fill="#fff8df"/>
        <path d="M18 36c4-10 11-15 20-14 8 1 13 7 14 16-5 6-12 9-21 8-7-1-11-5-13-10z" fill="#ff806c"/>
        <circle cx="27" cy="34" r="2.6" fill="#33241f"/>
        <circle cx="40" cy="34" r="2.6" fill="#33241f"/>
        <path d="M30 42c3 2 6 2 9 0" fill="none" stroke="#33241f" stroke-linecap="round" stroke-width="2.8"/>
        <path d="M20 20c-3-8-2-13 3-15 4-1 7 4 5 11" fill="none" stroke="#4c9a70" stroke-linecap="round" stroke-width="4"/>
        <path d="M47 21c5-7 9-9 12-6 3 4-1 8-8 10" fill="none" stroke="#4c9a70" stroke-linecap="round" stroke-width="4"/>
      </svg>
    </div>
  `;
}

function renderRecipes() {
  recipeCount.textContent = `${state.recipes.length} saved`;

  if (!state.recipes.length) {
    recipeList.innerHTML = `
      <div class="empty-state">
        <div class="mini-art" aria-hidden="true"></div>
        <p>Your saved recipes will appear here.</p>
      </div>
    `;
    return;
  }

  recipeList.innerHTML = state.recipes
    .map((recipe) => {
      const preview = recipe.ingredients.slice(0, 5);
      const extraCount = recipe.ingredients.length - preview.length;

      return `
        <article class="recipe-card">
          <div class="card-top">
            ${foodBadge(recipe.name)}
            <div>
              <h3>${escapeHtml(recipe.name)}</h3>
              <p>${recipe.ingredients.length} ingredients</p>
            </div>
          </div>
          <div class="ingredient-preview">
            ${preview.map((ingredient) => `<span class="pill">${escapeHtml(ingredient)}</span>`).join("")}
            ${extraCount > 0 ? `<span class="pill">+${extraCount} more</span>` : ""}
          </div>
          <div class="card-actions">
            <button class="icon-button" type="button" data-edit="${recipe.id}">Edit</button>
            <button class="icon-button danger" type="button" data-delete="${recipe.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMeals() {
  if (!state.recipes.length) {
    mealList.innerHTML = `
      <div class="empty-state">
        <div class="mini-art" aria-hidden="true"></div>
        <p>Add recipes first, then choose your meals here.</p>
      </div>
    `;
    return;
  }

  mealList.innerHTML = state.recipes
    .map((recipe) => {
      const selected = state.selectedRecipeIds.includes(recipe.id);
      return `
        <button class="meal-row ${selected ? "is-selected" : ""}" type="button" data-toggle="${recipe.id}" aria-pressed="${selected}">
          ${foodBadge(recipe.name)}
          <div>
            <h3>${escapeHtml(recipe.name)}</h3>
            <p>${recipe.ingredients.length} ingredients</p>
          </div>
          <span class="check-dot">✓</span>
        </button>
      `;
    })
    .join("");
}

function renderGroceries() {
  const groceries = uniqueGroceries();
  ingredientCount.textContent = `${groceries.length} ${groceries.length === 1 ? "item" : "items"}`;
  groceryList.innerHTML = groceries.map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("");
  emptyGrocery.classList.toggle("hidden", groceries.length > 0);
  copyList.disabled = groceries.length === 0;
}

function render() {
  renderRecipes();
  renderMeals();
  renderGroceries();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetForm() {
  state.editingRecipeId = null;
  recipeForm.reset();
  saveRecipe.textContent = "Save Recipe";
  cancelEdit.hidden = true;
}

function setView(viewId) {
  views.forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  tabButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.viewButton === viewId));
  copyStatus.textContent = "";
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewButton));
});

recipeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = recipeName.value.trim();
  const ingredients = cleanIngredientLines(recipeIngredients.value);

  if (!name || !ingredients.length) {
    recipeName.focus();
    return;
  }

  if (state.editingRecipeId) {
    state.recipes = state.recipes.map((recipe) =>
      recipe.id === state.editingRecipeId ? { ...recipe, name, ingredients } : recipe
    );
  } else {
    state.recipes.unshift({ id: crypto.randomUUID(), name, ingredients });
  }

  resetForm();
  saveState();
  render();
});

cancelEdit.addEventListener("click", resetForm);

recipeList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (editButton) {
    const recipe = state.recipes.find((item) => item.id === editButton.dataset.edit);
    if (!recipe) return;
    state.editingRecipeId = recipe.id;
    recipeName.value = recipe.name;
    recipeIngredients.value = recipe.ingredients.join("\n");
    saveRecipe.textContent = "Update Recipe";
    cancelEdit.hidden = false;
    recipeName.focus();
  }

  if (deleteButton) {
    const id = deleteButton.dataset.delete;
    state.recipes = state.recipes.filter((recipe) => recipe.id !== id);
    state.selectedRecipeIds = state.selectedRecipeIds.filter((recipeId) => recipeId !== id);
    saveState();
    render();
  }
});

mealList.addEventListener("click", (event) => {
  const row = event.target.closest("[data-toggle]");
  if (!row) return;

  const id = row.dataset.toggle;
  state.selectedRecipeIds = state.selectedRecipeIds.includes(id)
    ? state.selectedRecipeIds.filter((recipeId) => recipeId !== id)
    : [...state.selectedRecipeIds, id];

  saveState();
  renderMeals();
  renderGroceries();
});

clearWeek.addEventListener("click", () => {
  state.selectedRecipeIds = [];
  saveState();
  renderMeals();
  renderGroceries();
});

loadSample.addEventListener("click", () => {
  if (state.recipes.length && !confirm("Add sample recipes to your saved recipes?")) return;
  state.recipes = [...sampleRecipes.map((recipe) => ({ ...recipe, id: crypto.randomUUID() })), ...state.recipes];
  saveState();
  render();
});

copyList.addEventListener("click", async () => {
  const groceries = uniqueGroceries();
  const text = groceries.join("\n");
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = "Grocery list copied.";
  } catch {
    copyStatus.textContent = "Select and copy the list manually.";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

loadState();
render();
