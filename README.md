# Meal Basket

A tiny personal meal-planning web app for iPhone:

- Add recipes with a recipe name and multiline pasted ingredients.
- Select meals for the week.
- Generate one deduped grocery list.
- Copy the grocery list into Messages, Notes, Reminders, or anywhere else.
- Sync recipes and weekly selections across phone and computer with Firebase Firestore.
- Keep a device copy with `localStorage` as a fallback.
- Export and import a plain CSV backup if you ever want a manual copy.
- Optionally keep a starter `recipes.csv` file in the GitHub repo.

## Storage

GitHub Pages can host files, including a CSV, but it cannot safely write new recipes back to the repo from your phone or computer without exposing private GitHub credentials. Because you want updates to work from both devices, this app uses a very small Firebase Firestore backend for the live data.

The CSV feature is only a backup/import tool.

## Add Firebase Sync

1. Create a free Firebase project at <https://console.firebase.google.com/>.
2. In Firebase, add a **Web app**.
3. Copy the Firebase config values.
4. Paste those values into `firebase-config.js`.
5. In Firebase, enable **Authentication**.
6. Add **Google** as a sign-in provider.
7. In Firebase, enable **Cloud Firestore**.
8. Start Firestore in production mode.
9. Add your GitHub Pages domain to Firebase Authentication's authorized domains.

Use these Firestore security rules:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/appState/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Your Firebase API key is okay to include in this static app. The security rules above are what protect the data.

## CSV Backup Format

CSV format:

```csv
recipe,ingredient
Chicken Tacos,chicken
Chicken Tacos,tortillas
Chicken Tacos,salsa
Pasta,pasta
Pasta,tomato sauce
```

If you upload a `recipes.csv` file to the repo, the app will load it as starter data the first time it opens on a device. After that, Firebase sync is the source of truth once you sign in.

## Deploy On GitHub Pages

1. Create a new GitHub repository.
2. Upload these files to the repository:
   - `index.html`
   - `style.css`
   - `app.js`
   - `firebase-config.js`
   - `manifest.json`
   - `sw.js`
   - `recipes.csv`
   - `icons/icon.svg`
3. In GitHub, open the repository's **Settings**.
4. Go to **Pages**.
5. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/root**
6. Save and wait for GitHub to show your live website URL.

## Add To iPhone Home Screen

1. Open the GitHub Pages URL in Safari on your iPhone.
2. Tap the Share button.
3. Tap **Add to Home Screen**.
4. Name it `Meal Basket`.
5. Tap **Add**.
