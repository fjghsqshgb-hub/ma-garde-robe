# Ma Garde-robe — Application web installable

Gérez votre garde-robe personnelle, obtenez des recommandations et planifiez vos tenues. Installable sur iPhone et Android comme une vraie app.

---

## 🚀 Déploiement en 5 minutes (avec Vercel — gratuit)

### Étape 1 — Créez un compte GitHub (si ce n'est pas déjà fait)
Allez sur https://github.com/signup et créez un compte gratuit.

### Étape 2 — Mettez le code sur GitHub

**Option A : via l'interface web (le plus simple, sans ligne de commande)**

1. Sur GitHub, cliquez sur **"New repository"** (bouton vert en haut à droite, puis "New").
2. Nommez-le `ma-garde-robe`, laissez en public, cliquez **"Create repository"**.
3. Sur la page du repo vide, cliquez **"uploading an existing file"**.
4. Glissez-déposez **tout le contenu** du dossier `garde-robe-app` (mais PAS le dossier `node_modules` s'il existe, ni `dist`).
5. Tout en bas, cliquez **"Commit changes"**.

**Option B : via la ligne de commande (si vous êtes à l'aise)**

```bash
cd garde-robe-app
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/ma-garde-robe.git
git push -u origin main
```

### Étape 3 — Déployez sur Vercel

1. Allez sur https://vercel.com et connectez-vous avec votre compte GitHub.
2. Cliquez **"Add New... → Project"**.
3. Sélectionnez votre repo `ma-garde-robe` et cliquez **"Import"**.
4. Ne touchez à rien, cliquez **"Deploy"**.
5. Attendez ~1 minute. Vous obtiendrez une URL du type `https://ma-garde-robe-xxx.vercel.app`.

### Étape 4 — Installez-la sur votre téléphone

**Sur iPhone (Safari uniquement) :**
1. Ouvrez l'URL Vercel dans Safari.
2. Appuyez sur l'icône **Partager** (carré avec flèche vers le haut).
3. Faites défiler, touchez **"Sur l'écran d'accueil"**.
4. Confirmez. L'icône apparaît sur votre écran d'accueil comme une vraie app.

**Sur Android (Chrome) :**
1. Ouvrez l'URL dans Chrome.
2. Un bandeau "Installer l'application" apparaîtra (ou via le menu ⋮ → "Installer l'application").
3. Confirmez.

✅ **C'est tout !** Vous avez votre garde-robe dans votre poche, fonctionnant hors ligne.

---

## 💾 Vos données

- Tout est stocké **localement sur votre téléphone** (localStorage).
- Aucun serveur, aucun compte, aucune collecte.
- ⚠️ Si vous effacez les données du site dans votre navigateur, votre garde-robe sera perdue.

---

## 🔧 Développement local (optionnel)

Si vous voulez tester / modifier avant de publier :

```bash
npm install
npm run dev
```

Puis ouvrez http://localhost:5173

Pour construire la version de production :
```bash
npm run build
```

---

## ❓ Problèmes fréquents

**"L'icône n'apparaît pas après installation"** → Attendez quelques secondes, ou supprimez et réinstallez.

**"Vercel me demande une config"** → Il devrait détecter Vite automatiquement. Sinon, Framework Preset = Vite, Build Command = `npm run build`, Output Directory = `dist`.

**"Je veux modifier les catégories/couleurs"** → Éditez `src/App.jsx`, cherchez `const categories =` ou `const couleurs =`.
