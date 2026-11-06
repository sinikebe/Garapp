# Garapp

**Votre véhicule, pièce par pièce.**

Garapp est un projet de garage numérique personnel : retrouver les interventions
sur son véhicule, comprendre l'état de ses composants et suivre ce qu'il coûte
au fil du temps.

L'application appartient à la famille **finapps**, aux côtés de
[Finapp](https://github.com/sinikebe/finapp), et reprendra son identité visuelle
une fois sa refonte finalisée.

> **État du projet : initialisation.** Le dépôt contient la documentation et la
> chaîne de publication. Les fonctionnalités ci-dessous restent à développer.
> GitHub Pages affiche une page d'attente tant que l'application n'est pas présente.

## Ce que Garapp doit permettre

- **Garage** : regrouper les informations du véhicule et son kilométrage.
- **Interventions** : conserver les révisions, réparations et opérations
  d'entretien avec leur date, leur kilométrage, leurs notes et leurs factures.
- **Composants** : identifier les pièces et retrouver les interventions qui les
  ont contrôlées, entretenues ou remplacées.
- **Échéances** : suivre les intervalles en temps et en kilomètres pour anticiper
  les prochains entretiens.
- **Coûts** : distinguer pièces, main-d'œuvre et autres dépenses, puis consulter
  les dépenses par intervention, composant ou période. Le carburant, l'assurance
  et les autres frais pourront compléter le coût de possession.
- **Exploration visuelle, à étudier** : une vue 3D éclatée du véhicule, avec des
  composants cliquables et une coloration selon leur durée de vie estimée
  restante ou leur prix. Les estimations devront être distinguées des mesures
  et des préconisations constructeur.

## Versions publiées

| Branche | Usage | Adresse GitHub Pages |
| --- | --- | --- |
| `main` | Version de référence | <https://sinikebe.github.io/Garapp/> |
| `dev` | Développement et validation | <https://sinikebe.github.io/Garapp/dev/> |

Ces adresses sont disponibles après activation de GitHub Pages et réussite du
premier déploiement. Au démarrage, elles affichent une page d'attente identifiant
la branche et donnant accès à l'autre version.

Le travail courant se fait sur `dev`. Une fusion de `dev` vers `main` publie la
version de référence.

## CI et publication

Le workflow [GitHub Pages](.github/workflows/pages.yml) :

1. Vérifie la préparation du site à chaque push sur `main` ou `dev` et sur les
   pull requests visant ces branches.
2. Lors d'un push sur l'une de ces branches, ou d'un lancement manuel depuis
   `main` ou `dev`, récupère les dernières versions de **ces deux branches**.
3. Assemble `main` à la racine et `dev` dans le sous-dossier `dev/`, puis publie
   un seul artefact GitHub Pages.

Une pull request est vérifiée sans publication. Les publications sont
sérialisées et chaque exécution récupère les deux branches après sa mise en
attente : publier `dev` conserve la version issue de `main`, et inversement.
Une erreur de préparation interrompt la publication complète.

La CI utilise les actions officielles GitHub et le `GITHUB_TOKEN` fourni par
GitHub Actions. Aucun secret personnel et aucune branche `gh-pages` ne sont
nécessaires. Les droits de publication sont limités au job de déploiement.

### Activation dans GitHub

Dans [Settings → Pages](https://github.com/sinikebe/Garapp/settings/pages),
sélectionner **GitHub Actions** comme source de publication.

Si l'environnement `github-pages` limite les branches de déploiement, autoriser
**`main` et `dev`** dans
[Settings → Environments](https://github.com/sinikebe/Garapp/settings/environments).
Les deux branches doivent exister pour assembler le site.

Le workflow peut ensuite être relancé depuis
[Actions → GitHub Pages](https://github.com/sinikebe/Garapp/actions/workflows/pages.yml)
avec **Run workflow**, ou par un nouveau push sur `main` ou `dev`.

### Ajouter l'application ultérieurement

Le script [scripts/prepare_pages.py](scripts/prepare_pages.py) publie le contenu
de `public/` lorsqu'il existe. Ce dossier doit contenir un `index.html` non vide.
En son absence, le script génère la page d'attente. Un dossier `public/` présent
mais incomplet fait échouer la CI au lieu de masquer une erreur de livraison.

Seul le contenu de `public/` est copié : le dépôt, les scripts de CI et les
documents de travail restent hors du site publié. Les liens symboliques sont
refusés. Le nom `public/dev` est réservé à la version de développement.

Utiliser des chemins relatifs pour les ressources, par exemple `./assets/app.css`,
afin de fonctionner à la fois sous `/Garapp/` et `/Garapp/dev/`. Si un outil de
compilation est ajouté, il devra produire ce dossier avec le bon chemin de base.
Les éventuels service workers devront limiter leur portée à leur version.
Les deux versions partagent une origine GitHub Pages : les clés de stockage
local devront aussi être distinctes pour éviter de mélanger leurs données.

## Vérification locale

Python 3.10 ou plus récent suffit pour préparer la publication actuelle, sans
dépendance à installer :

```sh
python3 scripts/prepare_pages.py --source . --output /tmp/garapp-preview --branch dev
python3 -m http.server 8000 --directory /tmp/garapp-preview
```

Ouvrir <http://localhost:8000>. Le dossier de sortie doit être nouveau ; choisir
un autre chemin pour une seconde préparation. Cette commande sert à prévisualiser
une branche seule. L'assemblage des deux versions est effectué par le workflow.
