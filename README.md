# Shelf2 Inventory Pro

GitHub-ready refactor of the existing Shelf2 V7 application.

## Important

This version preserves the existing Supabase project configuration, table names, RPC calls, authentication flow, and inventory logic. It does not run a database migration and does not reset or replace existing data.

## Files

- `index.html` — page structure and external library loading
- `css/styles.css` — all application styling and responsive layouts
- `js/app.js` — existing application logic

## Deployment

Upload the entire folder structure to the same GitHub repository or hosting location:

```text
index.html
css/styles.css
js/app.js
```

Do not upload only `index.html`; the `css` and `js` folders are required.

For GitHub Pages, keep the files at the repository root and enable Pages for the desired branch.

## Data safety

The application continues connecting to the same Supabase project embedded in `js/app.js`. Existing inventory, product catalog, users, roles, categories, distributors, thresholds, and history remain in Supabase and are not stored inside the HTML file.

No SQL changes are required for this refactor.
