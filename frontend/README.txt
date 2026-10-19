SELBUY AUTH LAYOUT FIX

1. Replace frontend/src/App.jsx with src/App.jsx from this package.
2. Add frontend/src/components/AuthHeader.jsx.
3. Copy auth-layout.css to the END of frontend/src/styles.css.
4. Restart Vite: npm run dev

Result:
- Full marketplace navbar is hidden on /login and /register.
- Marketplace footer is also hidden on auth pages.
- Login/Register only show a small Selbuy header with Back to marketplace.
- Other pages keep the complete marketplace navbar and footer.