import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  enableIndexedDbPersistence,
  getFirestore,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const storeKey = "meal-basket-v1";
const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

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

let auth;
let db;
let currentUser = null;
let unsubscribeFromCloud = null;
let saveTimer = null;
let applyingCloudState = false;

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
const syncStatus = document.querySelector("#sync-status");
const authTitle = document.querySelector("#auth-title");
const authDetail = document.querySelector("#auth-detail");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const togglePassword = document.querySelector("#toggle-password");
const loginFields = document.querySelector("#login-fields");
const signIn = document.querySelector("#sign-in");
const exportBackup = document.querySelector("#export-backup");
const importBackup = document.querySelector("#import-backup");

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
  saveCloudState();
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

function setSyncStatus(message) {
  syncStatus.textContent = message;
}

function userDoc() {
  return doc(db, "users", currentUser.uid, "appState", "mealBasket");
}

function cloudPayload() {
  return {
    recipes: state.recipes,
    selectedRecipeIds: state.selectedRecipeIds,
    updatedAt: new Date().toISOString(),
  };
}

function saveCloudState() {
  if (applyingCloudState) return;

  if (!currentUser || !db) {
    setSyncStatus("Saved on this device");
    return;
  }

  window.clearTimeout(saveTimer);
  setSyncStatus("Saving...");
  saveTimer = window.setTimeout(async () => {
    try {
      await setDoc(userDoc(), cloudPayload());
      setSyncStatus("Synced");
    } catch {
      setSyncStatus("Saved on this device. Sync failed.");
    }
  }, 350);
}

function setupFirebase() {
  if (!isFirebaseConfigured) {
    authTitle.textContent = "Sync is not connected";
    authDetail.textContent = "Paste your Firebase settings into firebase-config.js first.";
    signIn.disabled = true;
    setSyncStatus("Saved on this device");
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    enableIndexedDbPersistence(db).catch(() => {});
  } catch (error) {
    authTitle.textContent = "Sync could not start";
    authDetail.textContent = "Firebase did not initialize. Check the config and browser console.";
    signIn.disabled = true;
    setSyncStatus(readableFirebaseError(error));
    return;
  }

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (unsubscribeFromCloud) unsubscribeFromCloud();
    unsubscribeFromCloud = null;

    if (!user) {
      authTitle.textContent = "Sign in for sync";
      authDetail.textContent = "Recipes update across your phone and computer.";
      loginFields.hidden = false;
      signIn.hidden = false;
      setSyncStatus("Saved on this device");
      return;
    }

    authTitle.textContent = user.displayName || "Sync is on";
    authDetail.textContent = user.email || "Signed in";
    loginFields.hidden = true;
    signIn.hidden = true;
    setSyncStatus("Loading synced recipes...");

    unsubscribeFromCloud = onSnapshot(
      userDoc(),
      async (snapshot) => {
        if (!snapshot.exists()) {
          if (state.recipes.length || state.selectedRecipeIds.length) {
            await setDoc(userDoc(), cloudPayload());
          }
          setSyncStatus("Synced");
          return;
        }

        const data = snapshot.data();
        applyingCloudState = true;
        state = {
          recipes: Array.isArray(data.recipes) ? data.recipes : [],
          selectedRecipeIds: Array.isArray(data.selectedRecipeIds) ? data.selectedRecipeIds : [],
          editingRecipeId: null,
        };
        localStorage.setItem(storeKey, JSON.stringify(state));
        applyingCloudState = false;
        resetForm();
        render();
        setSyncStatus("Synced");
      },
      () => {
        setSyncStatus("Saved on this device. Sync failed.");
      }
    );
  });
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

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function recipesToCsv() {
  const rows = [["recipe", "ingredient"]];

  state.recipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      rows.push([recipe.name, ingredient]);
    });
  });

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function recipesFromCsv(text) {
  const rows = parseCsv(text);
  const dataRows = rows[0]?.[0]?.toLowerCase() === "recipe" ? rows.slice(1) : rows;
  const recipes = new Map();

  dataRows.forEach(([name, ingredient]) => {
    if (!name || !ingredient) return;
    const key = name.trim().toLowerCase();

    if (!recipes.has(key)) {
      recipes.set(key, {
        id: crypto.randomUUID(),
        name: name.trim(),
        ingredients: [],
      });
    }

    const recipe = recipes.get(key);
    const cleanIngredient = ingredient.trim();
    const alreadyAdded = recipe.ingredients.some(
      (existing) => normalizeIngredient(existing) === normalizeIngredient(cleanIngredient)
    );

    if (!alreadyAdded) recipe.ingredients.push(cleanIngredient);
  });

  return [...recipes.values()].filter((recipe) => recipe.ingredients.length);
}

async function loadRepoCsvIfNeeded() {
  if (state.recipes.length) return;

  try {
    const response = await fetch("recipes.csv", { cache: "no-store" });
    if (!response.ok) return;
    const recipes = recipesFromCsv(await response.text());
    if (!recipes.length) return;
    state.recipes = recipes;
    saveState();
  } catch {
    setSyncStatus("Saved on this device");
  }
}

function normalizeIngredient(ingredient) {
  return ingredient.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueGroceries() {
  const selected = new Set(state.selectedRecipeIds);
  const groceries = new Map();

  state.recipes
    .filter((recipe) => selected.has(recipe.id))
    .forEach((recipe) => {
      const recipeIngredients = new Set();

      recipe.ingredients.forEach((ingredient) => {
        const key = normalizeIngredient(ingredient);
        if (!groceries.has(key)) {
          groceries.set(key, { ingredient, count: 0 });
        }
        recipeIngredients.add(key);
      });

      recipeIngredients.forEach((key) => {
        groceries.get(key).count += 1;
      });
    });

  return [...groceries.values()].sort((a, b) => a.ingredient.localeCompare(b.ingredient));
}

function groceryLabel(grocery) {
  return grocery.count > 1 ? `${grocery.ingredient} (${grocery.count})` : grocery.ingredient;
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
  groceryList.innerHTML = groceries.map((grocery) => `<li>${escapeHtml(groceryLabel(grocery))}</li>`).join("");
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
  const text = groceries.map(groceryLabel).join("\n");
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = "Grocery list copied.";
  } catch {
    copyStatus.textContent = "Select and copy the list manually.";
  }
});

exportBackup.addEventListener("click", () => {
  const blob = new Blob([recipesToCsv()], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "meal-basket-recipes.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  setSyncStatus("CSV backup exported");
});

importBackup.addEventListener("change", async () => {
  const file = importBackup.files?.[0];
  if (!file) return;

  const importedRecipes = recipesFromCsv(await file.text());
  importBackup.value = "";

  if (!importedRecipes.length) {
    setSyncStatus("No recipes found in that CSV");
    return;
  }

  state.recipes = importedRecipes;
  state.selectedRecipeIds = state.selectedRecipeIds.filter((id) => state.recipes.some((recipe) => recipe.id === id));
  resetForm();
  saveState();
  render();
  setSyncStatus(currentUser ? "Imported. Syncing..." : "CSV backup imported");
});

togglePassword.addEventListener("click", () => {
  const isVisible = password.type === "text";
  password.type = isVisible ? "password" : "text";
  togglePassword.textContent = isVisible ? "Show" : "Hide";
  togglePassword.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
  togglePassword.setAttribute("aria-pressed", String(!isVisible));
});

signIn.addEventListener("click", async () => {
  if (!auth) {
    setSyncStatus("Firebase is not ready yet");
    return;
  }
  const emailValue = email.value.trim();
  const passwordValue = password.value;

  if (!emailValue || !passwordValue) {
    setSyncStatus("Enter email and password");
    return;
  }

  try {
    setSyncStatus("Signing in...");
    await signInWithEmailAndPassword(auth, emailValue, passwordValue);
  } catch (error) {
    setSyncStatus(readableAuthError(error));
  }
});

function readableAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Email or password is incorrect";
  if (code.includes("user-not-found")) return "No account found. Add the user in Firebase Console.";
  if (code.includes("email-already-in-use")) return "Account already exists. Try Sign In.";
  if (code.includes("weak-password")) return "Use a password with at least 6 characters";
  if (code.includes("invalid-email")) return "Enter a valid email address";
  if (code.includes("operation-not-allowed")) return "Enable Email/Password in Firebase Authentication";
  if (code.includes("unauthorized-domain")) return "Add this website domain in Firebase Authentication settings";
  if (code.includes("configuration-not-found")) return "Firebase Auth is not set up for this project";
  if (code.includes("api-key-not-valid")) return "Firebase API key is not valid";
  if (code.includes("app-not-authorized")) return "Add this app domain in Firebase Authentication settings";
  if (code.includes("network-request-failed")) return "Network blocked Firebase. Check internet or content blockers.";
  return "Sign-in failed";
}

function readableFirebaseError(error) {
  const message = error?.message || "";
  if (message.includes("Failed to resolve module specifier")) return "Firebase imports are not loading";
  if (message.includes("Firebase App named")) return "Firebase app setup conflicted";
  return "Firebase setup failed";
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

loadState();
setupFirebase();
loadRepoCsvIfNeeded().finally(render);
