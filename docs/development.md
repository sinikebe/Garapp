# Développement et publication

[Accueil du projet](../README.md) · [Contribuer](../CONTRIBUTING.md)

Garapp est un site statique en HTML, CSS et modules JavaScript natifs. Le cœur métier
et les tests utilisent les API standard de Node.js et du navigateur. Aucun serveur
applicatif, gestionnaire d'état externe ou compilation de l'interface n'est nécessaire.

## Exécuter le projet

Prérequis : Node.js 22.12 ou plus récent. Python 3.10 ou plus récent sert uniquement
à préparer la publication GitHub Pages.

```sh
npm ci
npm start
```

Le serveur écoute sur [http://localhost:4173](http://localhost:4173).
`npm run dev` lance le même serveur. Pour choisir un autre port :

```sh
npm start -- --port 4174
```

Les ressources utilisent des chemins relatifs pour fonctionner à la racine de Garapp
comme dans son sous-dossier `dev/`. Le serveur refuse les chemins sortant de `public/`,
y compris à travers un lien symbolique. Il calcule le service worker en mémoire à
chaque requête pour permettre la détection des modifications locales.

Après une modification de `public/` ou du modèle du service worker :

```sh
npm run build:pwa
npm run check
```

`public/sw.js` est généré depuis `tools/service-worker.template.js` et les empreintes
de tous les fichiers publics. Il est suivi dans Git et doit être inclus dans le même
changement que ses ressources. Ne pas le modifier manuellement. Les tests détectent
les empreintes périmées.

| Commande | Vérification |
| --- | --- |
| `npm run check:source` | Syntaxe, références locales, documentation et empreintes du bundle |
| `npm run check:backups` | Compatibilité historique, stockage, fichiers liés et Drive |
| `npm test` | Ensemble des tests Node |
| `npm run check` | Sources, compatibilité et ensemble des tests |

## Organisation du code

| Emplacement | Responsabilité |
| --- | --- |
| `public/index.html` | Structure de l'application, navigation et formulaires |
| `public/assets/css/` | Thèmes, dispositions, composants et adaptations aux écrans |
| `public/assets/js/app.js` | Démarrage, événements, éditeurs et orchestration des vues |
| `public/assets/js/ui-format.js` | Échappement HTML et formatage de présentation partagé |
| `public/assets/js/overview-view.js` | Rendu pur du tableau de bord, de l'historique et des dépenses |
| `public/assets/js/garage.js` | Modèle, validation, migration, inventaire et calculs métier de base |
| `public/assets/js/amounts.js` | Calculs décimaux exacts et formatage des montants |
| `public/assets/js/statistics.js`, `fuel-statistics.js`, `insurance.js` | Calculs spécialisés, indépendants du DOM |
| `public/assets/js/*-view.js` | Présentation des statistiques, carburant, assurance et composants |
| `public/assets/js/component-*.js`, `vehicle-visual.js` | Connaissance des pièces, disposition et rendus 3D |
| `public/assets/js/storage.js` | Persistance locale, révisions et archives de récupération |
| `public/assets/js/workspace-transactions.js` | Validation et remplacement transactionnel lors d'un import |
| `public/assets/js/backups.js`, `backup-panel.js`, `recovery-panel.js` | Fichiers portables, fichiers liés et interface de récupération |
| `public/assets/js/drive-*.js` | Authentification, transport, format, synchronisation et interface Drive |
| `public/assets/js/navigation.js`, `pwa.js` | Contexte de navigation et cycle de vie hors connexion |
| `tools/` | Serveur local, génération du worker et entretien des ressources tierces |
| `scripts/prepare_pages.py` | Assemblage du site statique publié |
| `test/` | Tests métier et simulations des API navigateur/Drive |
| `docs/` | Guide d'utilisation et contrats de données |

Les vues calculent leur HTML à partir des données reçues. Les handlers de l'application
coordonnent la saisie et la persistance. Les écrans masqués ne sont pas rendus à chaque
mise à jour. Les modules de calcul ne doivent pas modifier le garage qu'ils reçoivent.

## Préserver les sauvegardes

Le [format portable](backup-format.md) est un contrat de compatibilité. Un changement
du modèle doit conserver les anciens champs, leurs valeurs exactes et les propriétés
supplémentaires, même si l'interface ne les exploite pas.

- Garder les montants en chaînes décimales. Ne pas convertir une valeur absente en zéro.
- Valider les références entre fiches, composants et documents avant tout remplacement.
- Conserver les documents originaux, y compris ceux des lignes, contrats et fiches de la corbeille.
- Refuser une version future inconnue sans écraser la copie enregistrée.
- Tester la lecture des fixtures historiques et l'idempotence d'un export/import.
- Vérifier les erreurs de stockage, les conflits d'onglets et les échecs de transfert.

Une fixture historique représente un format déjà accepté. Ajouter un nouveau cas
pour un nouveau format ; ne pas réécrire les anciens exports pour les adapter au
lecteur courant. Les fixtures doivent contenir exclusivement des données fictives.
Les tests peuvent vérifier une conversion explicite, par exemple les centimes du
format 1, mais doivent comparer les contenus conservés et les octets des documents.

Les contrôles d'intégrité Drive portent sur le contenu enregistré. La migration du
modèle ne doit pas modifier les octets ou les empreintes attendues d'une révision
historique. Les archives locales de récupération sont séparées du garage actif et
ne remplacent pas une sauvegarde sur un autre support.

## Vérification d'une modification

Les tests Node couvrent le modèle, les montants, les imports/exports, le stockage,
les fichiers liés, Drive simulé, la navigation, les graphiques, les composants,
l'assurance, la corbeille et le cycle de vie de la PWA. Ils n'utilisent aucun garage
réel ni compte Google. Un succès automatique ne remplace pas une vérification des
écrans modifiés et des intégrations propres à chaque navigateur.

Pour une modification d'interface, utiliser un garage fictif et vérifier :

1. Les trois présentations, les apparences claire et sombre, et les écrans étroits.
2. Les libellés longs, les valeurs absentes et les tableaux nécessitant un défilement.
3. Le parcours clavier, le focus des dialogues et les messages d'erreur.
4. Les formulaires, l'ouverture des documents et les actions d'import/export concernées.
5. La mise à jour et l'ouverture hors connexion lorsque les ressources publiques changent.

Les essais Google réels exigent un client OAuth autorisé. Leur procédure et leurs
limites figurent dans le [guide Drive](google-drive.md). Les autorisations de fichiers,
les quotas et l'installation PWA dépendent du navigateur utilisé.

## CI et publication

La publication Workers utilise maintenant les runners GitHub hébergés, un
Wrangler local verrouillé et des gardes de branche/révision. Les PR sont
vérifiées sans secrets ; seuls main et dev peuvent être publiés après CI ou
demande manuelle explicite. Le [guide Cloudflare](cloudflare-hosting.md)
décrit les secrets, les commandes et la Preview nommée dev. Les Builds
Cloudflare précédents doivent rester désactivés pour éviter deux pipelines.

La [CI](../.github/workflows/ci.yml) s'exécute sur les pushes `main` et `dev`, sur
les pull requests visant ces branches et lors d'un lancement manuel. Une pull request
est vérifiée sans être publiée. Les règles de protection GitHub doivent rendre ces
contrôles obligatoires pour empêcher une fusion qui les contournerait.

Le workflow [GitHub Pages](../.github/workflows/pages.yml) s'exécute depuis `main`.
Après une CI réussie, il assemble les deux branches dans un même artefact :

| Branche | Destination | Données navigateur |
| --- | --- | --- |
| `main` | [Version principale](https://sinikebe.github.io/Garapp/) | Garage et caches propres à ce chemin |
| `dev` | [Version de développement](https://sinikebe.github.io/Garapp/dev/) | Garage et caches distincts |

Ces deux anciennes entrées publient désormais des redirecteurs vers
`https://garapp.siniverse.cc/`. L'application de chaque branche est conservée
dans `recovery.html` à la même base pour exporter les données locales. Le
[guide des anciennes adresses](legacy-pages.md) décrit les limites du changement
d'origine, le retrait des anciens service workers et la promotion nécessaire de
l'outillage vers `main`. Le build Cloudflare reste indépendant de cet artefact.

Les publications sont sérialisées. Le workflow récupère les branches après sa mise
en attente, exige une CI réussie pour chacun des deux commits récupérés, puis valide
ces révisions avant l'envoi de l'artefact. Une branche devenue invalide depuis le
déclenchement bloque la publication ; une CI encore en cours doit d'abord se terminer.
La CI refuse également la modification ou la suppression d'une fixture historique
existante par rapport à la base du changement. Les droits `pages`
et `id-token` restent limités au job de publication ; aucun jeton personnel ni branche
`gh-pages` n'est nécessaire.

Dans les paramètres GitHub Pages, sélectionner **GitHub Actions** comme source.
L'environnement `github-pages`, s'il limite les branches, doit autoriser `main`.
Les branches `main` et `dev` doivent toutes deux exister. Le workflow Pages peut être
relancé manuellement depuis `main`.

Seules les ressources de `public/` et les fichiers de transition Pages sont publiés.
Le dossier doit contenir un `index.html` UTF-8 non vide,
ne doit contenir aucun lien symbolique, et `public/dev` reste réservé. Les données
du garage, exports, documents personnels et fichiers de travail ne doivent jamais
être placés dans ce dossier. Le script possède une page d'attente pour un dépôt sans
`public/`, mais refuse un dossier public présent et incomplet.

Pour vérifier l'assemblage local, choisir un dossier de sortie nouveau, hors de `public/` :

```sh
python3 scripts/prepare_pages.py --source . --output /tmp/garapp-preview --branch dev
```

## Ressources tierces et confidentialité

Les ressources d'interface et le lecteur GLB sont livrés localement. Le rendu éclaté
des composants utilise ses propres volumes schématiques. Les fichiers du lecteur
GLB et leurs licences sont dans `public/assets/vendor/model-viewer/` ; consulter
[les attributions](../THIRD_PARTY_NOTICES.md) avant de mettre à jour ces ressources.

Ne jamais publier de garage personnel, export privé, document réel, jeton OAuth,
secret ou information de compte dans le code, les fixtures, les captures, les logs
ou les messages de commit. Les détails des changements doivent décrire le projet,
sans dépendre d'une conversation privée.
